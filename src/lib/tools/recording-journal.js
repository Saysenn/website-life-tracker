/**
 * A crash-safe copy of a recording while it's being made. Every chunk the recorder hands over is written to
 * IndexedDB straight away, so a refresh, a closed tab or a browser crash loses at most the last second.
 * When the page opens again, anything left behind is put back together and returned as a finished recording.
 *
 * A live recording holds a Web Lock named after its journal, so another open tab never "recovers" a
 * recording that is still going.
 */

import { fixWebmDuration } from "@/lib/tools/screen/capture";

const DB_NAME = "uncler-journal";
const SESSIONS = "sessions";
const CHUNKS = "chunks";
const LOCK_PREFIX = "uncler-rec:";

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { autoIncrement: true }).createIndex("session", "session");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

function tx(stores, mode, action) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(stores, mode);
        const result = action(transaction);
        transaction.oncomplete = () => resolve(result?.result ?? result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Storage was cancelled"));
      }),
  );
}

function holdLock(id) {
  if (!navigator.locks?.request) return () => {};
  let release;
  const held = new Promise((resolve) => (release = resolve));
  navigator.locks.request(LOCK_PREFIX + id, () => held).catch(() => {});
  return release;
}

/**
 * Starts journalling a recording. `meta` is kept with it and comes back on recovery:
 * { tool, kind, name, mime, width?, height?, thumb? }
 */
export async function startJournal(meta) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const release = holdLock(id);
  const session = { ...meta, id, elapsed: 0, bytes: 0, startedAt: Date.now(), updatedAt: Date.now() };
  try {
    await tx([SESSIONS], "readwrite", (t) => t.objectStore(SESSIONS).put(session));
  } catch {
    release();
    return null;
  }

  let seq = 0;
  let chain = Promise.resolve();
  let broken = false;
  const queue = (work) => {
    chain = chain.then(work).catch(() => {
      broken = true;
    });
    return chain;
  };

  return {
    id,
    /** Adds the next piece of the recording, and how long the recording is so far (ms). */
    append(blob, elapsed) {
      if (broken || !blob?.size) return chain;
      const n = seq++;
      session.bytes += blob.size;
      session.elapsed = elapsed;
      session.updatedAt = Date.now();
      const snapshot = { ...session };
      return queue(() =>
        tx([SESSIONS, CHUNKS], "readwrite", (t) => {
          t.objectStore(CHUNKS).add({ session: id, seq: n, blob });
          t.objectStore(SESSIONS).put(snapshot);
        }),
      );
    },
    /** Changes the kept details, e.g. once a thumbnail exists. */
    update(patch) {
      Object.assign(session, patch);
      const snapshot = { ...session };
      return queue(() => tx([SESSIONS], "readwrite", (t) => t.objectStore(SESSIONS).put(snapshot)));
    },
    /** The recording was saved properly: throw the copy away. */
    async discard() {
      await chain;
      await removeSession(id).catch(() => {});
      release();
    },
  };
}

function removeSession(id) {
  return tx([SESSIONS, CHUNKS], "readwrite", (t) => {
    t.objectStore(SESSIONS).delete(id);
    const index = t.objectStore(CHUNKS).index("session");
    index.openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      t.objectStore(CHUNKS).delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

async function liveLocks() {
  try {
    const { held = [] } = (await navigator.locks?.query?.()) ?? {};
    return new Set(held.map((lock) => lock.name));
  } catch {
    return new Set();
  }
}

/**
 * Rebuilds every recording of `tool` that was cut off before it could be saved. Each one is handed to `save`
 * (which should put it in the media store) and only cleared from the journal once that worked.
 * Returns the recovered media items.
 */
export function recoverJournals(tool, save) {
  // One recovery at a time, across tabs too, so a recording is never rebuilt (and announced) twice.
  if (recovering.has(tool)) return recovering.get(tool).then(() => []);
  const run = navigator.locks?.request ? navigator.locks.request(`uncler-recover:${tool}`, () => recover(tool, save)) : recover(tool, save);
  const done = run.finally(() => recovering.delete(tool));
  recovering.set(tool, done);
  return done;
}

const recovering = new Map();

async function recover(tool, save) {
  let sessions;
  try {
    sessions = await tx([SESSIONS], "readonly", (t) => t.objectStore(SESSIONS).getAll());
  } catch {
    return [];
  }
  const live = await liveLocks();
  const items = [];
  for (const session of sessions ?? []) {
    if (session.tool !== tool || live.has(LOCK_PREFIX + session.id)) continue;
    try {
      const chunks = await tx([CHUNKS], "readonly", (t) => t.objectStore(CHUNKS).index("session").getAll(session.id));
      chunks.sort((a, b) => a.seq - b.seq);
      if (chunks.length) {
        const raw = new Blob(
          chunks.map((chunk) => chunk.blob),
          { type: session.mime },
        );
        const blob = await fixWebmDuration(raw, session.elapsed);
        const item = {
          id: session.id,
          tool: session.tool,
          kind: session.kind,
          name: session.name,
          mime: session.mime,
          size: blob.size,
          duration: session.elapsed / 1000,
          width: session.width,
          height: session.height,
          createdAt: session.startedAt,
          blob,
          thumb: session.thumb ?? null,
          badge: "Recovered",
        };
        await save(item);
        items.push(item);
      }
      await removeSession(session.id);
    } catch {
      // Leave it for the next visit rather than lose it.
    }
  }
  return items;
}
