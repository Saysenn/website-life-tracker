/**
 * Recordings kept on this device in IndexedDB, so they survive a reload and never leave the browser.
 * Each item: { id, tool, kind, name, mime, size, duration, width, height, createdAt, blob?, handle?, thumb? }
 * A recording written straight to a chosen folder keeps its file handle instead of a copy of the bytes.
 */

const DB_NAME = "uncler-media";
const STORE = "items";
const KV = "kv";

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("tool", "tool");
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

async function run(store, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage was cancelled"));
  });
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listMedia(tool) {
  const items = await run(STORE, "readonly", (store) => store.index("tool").getAll(tool));
  return (items ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveMedia(item) {
  navigator.storage?.persist?.().catch(() => {});
  return run(STORE, "readwrite", (store) => store.put(item));
}

export function deleteMedia(id) {
  return run(STORE, "readwrite", (store) => store.delete(id));
}

export function getSetting(key) {
  return run(KV, "readonly", (store) => store.get(key));
}

export function setSetting(key, value) {
  return run(KV, "readwrite", (store) => (value === undefined ? store.delete(key) : store.put(value, key)));
}

/** The bytes of an item, asking again for folder access when a saved file handle needs it. */
export async function mediaBlob(item) {
  if (item.blob) return item.blob;
  if (!item.handle) throw new Error("This recording has no data");
  if ((await item.handle.queryPermission?.({ mode: "read" })) !== "granted") {
    if ((await item.handle.requestPermission?.({ mode: "read" })) !== "granted") throw new Error("Allow access to the folder to open it");
  }
  return item.handle.getFile();
}

export async function storageUsage() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

export function fmtClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** A small JPEG data URL of a drawable, for list thumbnails. */
export function thumbnail(source, width, height, max = 320) {
  if (!width || !height) return null;
  const scale = Math.min(1, max / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  try {
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
