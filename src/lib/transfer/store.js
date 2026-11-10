import "server-only";
import { and, asc, count, desc, eq, gt, inArray, lt, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { transferChats, transferChunks, transferFiles, transferLink, transferMessages } from "@/db/schema";
import { HttpError } from "./access";
import {
  CHUNK_SIZE,
  GUEST_QUOTA_BYTES,
  MAX_FILE_BYTES,
  MAX_MESSAGE,
  MAX_NAME,
  ONLINE_MS,
  RETENTION_MS,
  TYPING_MS,
} from "./constants";
import { hashToken, randomId, sameText, seal, sealText, unseal, unsealText } from "./crypto";

const STARTS_PER_HOUR = 5;
const MESSAGES_PER_MINUTE = 30;
const OPEN_UPLOADS = 10;

const peerOf = (role) => (role === "admin" ? "guest" : "admin");
const expiresOf = (chat) => chat.createdAt + RETENTION_MS;

export function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function cleanFileName(value) {
  const name = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F/\\]/g, "")
    .trim()
    .slice(-200);
  return name || "file";
}

function cleanType(value) {
  const type = String(value ?? "").toLowerCase();
  return /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.slice(0, 120) : "application/octet-stream";
}

/* Link */

export async function getLinkKey() {
  const row = await db.query.transferLink.findFirst({ where: eq(transferLink.id, 1) });
  if (row) return row.key;
  return rotateLinkKey();
}

export async function rotateLinkKey() {
  const key = randomId(18);
  await db
    .insert(transferLink)
    .values({ id: 1, key, rotatedAt: Date.now() })
    .onConflictDoUpdate({ target: transferLink.id, set: { key, rotatedAt: Date.now() } });
  return key;
}

export async function linkMatches(key) {
  return typeof key === "string" && key.length > 0 && sameText(await getLinkKey(), key);
}

/* Cleanup: a chat and everything in it is deleted 24 hours after it started. */

let lastPurge = 0;

export async function purgeExpired({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPurge < 60_000) return;
  lastPurge = now;

  const expired = await db
    .select({ id: transferChats.id })
    .from(transferChats)
    .where(lt(transferChats.createdAt, now - RETENTION_MS));
  if (expired.length) await deleteChats(expired.map((chat) => chat.id));

  const stale = await db
    .select({ id: transferFiles.id })
    .from(transferFiles)
    .where(and(eq(transferFiles.status, "uploading"), lt(transferFiles.createdAt, now - 6 * 60 * 60 * 1000)));
  if (stale.length) await deleteFileRows(stale.map((file) => file.id));
}

async function deleteFileRows(ids) {
  if (!ids.length) return;
  await db.delete(transferChunks).where(inArray(transferChunks.fileId, ids));
  await db.delete(transferFiles).where(inArray(transferFiles.id, ids));
}

async function deleteChats(ids) {
  const files = await db.select({ id: transferFiles.id }).from(transferFiles).where(inArray(transferFiles.chatId, ids));
  await deleteFileRows(files.map((file) => file.id));
  await db.delete(transferMessages).where(inArray(transferMessages.chatId, ids));
  await db.delete(transferChats).where(inArray(transferChats.id, ids));
}

export async function deleteChat(id) {
  await deleteChats([id]);
}

/* Chats */

export async function getChat(id) {
  const chat = await db.query.transferChats.findFirst({ where: eq(transferChats.id, String(id)) });
  if (!chat || expiresOf(chat) < Date.now()) throw new HttpError(404, "This chat no longer exists.");
  return chat;
}

export async function startChat({ name, ip, location, userAgent }) {
  const cleanName = cleanText(name, MAX_NAME);
  if (!cleanName) throw new HttpError(400, "Tell us your name first.");

  const now = Date.now();
  const [recent] = await db
    .select({ total: count() })
    .from(transferChats)
    .where(and(eq(transferChats.ip, ip), gt(transferChats.createdAt, now - 60 * 60 * 1000)));
  if (recent.total >= STARTS_PER_HOUR) throw new HttpError(429, "Too many new chats from your network. Try again in an hour.");

  const token = randomId(32);
  const [chat] = await db
    .insert(transferChats)
    .values({
      id: randomId(12),
      name: cleanName,
      tokenHash: hashToken(token),
      ip,
      location,
      userAgent,
      createdAt: now,
      activeAt: now,
      guestSeenAt: now,
    })
    .returning();
  return { chat, token };
}

const AGENT_CHAT_NAME = "Grok";

/** The chat where the assistant's own files and notes land. Made again after each cleanup. */
export async function agentChat() {
  const now = Date.now();
  const existing = await db.query.transferChats.findFirst({
    where: and(eq(transferChats.ip, "agent"), gt(transferChats.createdAt, now - RETENTION_MS)),
    orderBy: desc(transferChats.createdAt),
  });
  if (existing) return { chat: existing, created: false };
  const [chat] = await db
    .insert(transferChats)
    .values({
      id: randomId(12),
      name: AGENT_CHAT_NAME,
      tokenHash: hashToken(randomId(32)),
      ip: "agent",
      location: "AI assistant",
      userAgent: "Grok via MCP",
      createdAt: now,
      activeAt: now,
      guestSeenAt: now,
    })
    .returning();
  return { chat, created: true };
}

export async function setBlocked(id, blocked) {
  await getChat(id);
  await db.update(transferChats).set({ blocked: Boolean(blocked) }).where(eq(transferChats.id, id));
}

function chatView(chat, role) {
  const base = {
    id: chat.id,
    name: chat.name,
    blocked: chat.blocked,
    createdAt: chat.createdAt,
    expiresAt: expiresOf(chat),
  };
  if (role !== "admin") return base;
  return { ...base, ip: chat.ip, location: chat.location, userAgent: chat.userAgent };
}

function fileView(file, received) {
  if (!file) return null;
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    status: file.status,
    sender: file.sender,
    progress: file.status === "ready" ? 1 : Math.min(1, (received ?? 0) / file.chunkCount),
  };
}

function messageView(message, filesById) {
  return {
    id: message.id,
    sender: message.sender,
    body: message.body ? unsealText(message.body) : null,
    file: message.fileId ? (fileView(filesById.get(message.fileId)) ?? { id: message.fileId, status: "removed" }) : null,
    createdAt: message.createdAt,
  };
}

async function receivedCounts(fileIds) {
  if (!fileIds.length) return new Map();
  const rows = await db
    .select({ fileId: transferChunks.fileId, total: count() })
    .from(transferChunks)
    .where(inArray(transferChunks.fileId, fileIds))
    .groupBy(transferChunks.fileId);
  return new Map(rows.map((row) => [row.fileId, row.total]));
}

/**
 * One polling round. Marks this side as seen (and typing), advances the read
 * cursor when the page is visible, and returns everything after `after`.
 */
export async function syncChat(chat, role, { after = 0, typing = false, visible = true, touch = true } = {}) {
  const now = Date.now();
  const cursor = Number.isInteger(after) && after > 0 ? after : 0;

  const messages = await db
    .select()
    .from(transferMessages)
    .where(and(eq(transferMessages.chatId, chat.id), gt(transferMessages.id, cursor)))
    .orderBy(asc(transferMessages.id))
    .limit(500);

  const files = await db.select().from(transferFiles).where(eq(transferFiles.chatId, chat.id));
  const filesById = new Map(files.map((file) => [file.id, file]));
  const peer = peerOf(role);
  const incomingFiles = files.filter((file) => file.status === "uploading" && file.sender === peer);
  const received = await receivedCounts(incomingFiles.map((file) => file.id));

  const latestId = messages.at(-1)?.id ?? cursor;
  const mine = role === "admin" ? "admin" : "guest";
  const update = { [`${mine}SeenAt`]: now, [`${mine}TypingAt`]: typing ? now : null };
  if (visible && latestId > chat[`${mine}ReadId`]) update[`${mine}ReadId`] = latestId;
  if (touch) await db.update(transferChats).set(update).where(eq(transferChats.id, chat.id));

  return {
    chat: chatView(chat, role),
    peer: {
      online: now - (chat[`${peer}SeenAt`] ?? 0) < ONLINE_MS,
      typing: now - (chat[`${peer}TypingAt`] ?? 0) < TYPING_MS,
      readId: chat[`${peer}ReadId`],
      seenAt: chat[`${peer}SeenAt`],
    },
    messages: messages.map((message) => messageView(message, filesById)),
    files: Object.fromEntries(files.map((file) => [file.id, file.status])),
    incoming: incomingFiles.map((file) => fileView(file, received.get(file.id))),
  };
}

async function addMessage(chat, sender, values) {
  const now = Date.now();
  const [message] = await db
    .insert(transferMessages)
    .values({ chatId: chat.id, sender, createdAt: now, ...values })
    .returning();
  await db
    .update(transferChats)
    .set({ activeAt: now, [`${sender}TypingAt`]: null })
    .where(eq(transferChats.id, chat.id));
  return message;
}

function assertOpen(chat, role) {
  if (role === "guest" && chat.blocked) throw new HttpError(403, "This chat was closed by the admin.");
}

export async function postMessage(chat, role, body) {
  assertOpen(chat, role);
  const text = cleanText(body, MAX_MESSAGE);
  if (!text) throw new HttpError(400, "Type a message first.");

  if (role === "guest") {
    const [recent] = await db
      .select({ total: count() })
      .from(transferMessages)
      .where(and(eq(transferMessages.chatId, chat.id), gt(transferMessages.createdAt, Date.now() - 60_000)));
    if (recent.total >= MESSAGES_PER_MINUTE) throw new HttpError(429, "Slow down a little, then send again.");
  }

  const message = await addMessage(chat, role, { body: sealText(text) });
  return messageView(message, new Map());
}

/* Files */

export async function createFile(chat, role, { name, size, type }) {
  assertOpen(chat, role);
  const bytes = Number(size);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new HttpError(400, "That file could not be read.");
  if (bytes > MAX_FILE_BYTES) throw new HttpError(413, "Files can be up to 2 GB each.");

  const [open] = await db
    .select({ total: count() })
    .from(transferFiles)
    .where(and(eq(transferFiles.chatId, chat.id), eq(transferFiles.status, "uploading")));
  if (open.total >= OPEN_UPLOADS) throw new HttpError(429, "Wait for the current uploads to finish.");

  if (role === "guest") {
    const [used] = await db
      .select({ total: sum(transferFiles.size) })
      .from(transferFiles)
      .where(and(eq(transferFiles.chatId, chat.id), eq(transferFiles.sender, "guest")));
    if (Number(used.total ?? 0) + bytes > GUEST_QUOTA_BYTES) throw new HttpError(413, "This chat has reached its 3 GB limit.");
  }

  const [file] = await db
    .insert(transferFiles)
    .values({
      id: randomId(16),
      chatId: chat.id,
      sender: role,
      name: cleanFileName(name),
      type: cleanType(type),
      size: bytes,
      chunkSize: CHUNK_SIZE,
      chunkCount: Math.max(1, Math.ceil(bytes / CHUNK_SIZE)),
      createdAt: Date.now(),
      expiresAt: expiresOf(chat),
    })
    .returning();
  return { id: file.id, chunkSize: file.chunkSize, chunkCount: file.chunkCount };
}

export async function getFile(id) {
  const file = await db.query.transferFiles.findFirst({ where: eq(transferFiles.id, String(id)) });
  if (!file || file.expiresAt < Date.now()) throw new HttpError(404, "This file is no longer available.");
  return file;
}

function expectedLength(file, index) {
  return index === file.chunkCount - 1 ? file.size - index * file.chunkSize : file.chunkSize;
}

export async function putChunk(file, index, data) {
  if (file.status !== "uploading") throw new HttpError(409, "This upload is already finished.");
  if (!Number.isInteger(index) || index < 0 || index >= file.chunkCount) throw new HttpError(400, "Invalid part.");
  if (data.byteLength !== expectedLength(file, index)) throw new HttpError(400, "That part arrived incomplete. Retrying.");

  await db
    .insert(transferChunks)
    .values({ fileId: file.id, index, data: seal(Buffer.from(data)) })
    .onConflictDoUpdate({ target: [transferChunks.fileId, transferChunks.index], set: { data: sql`excluded.data` } });
}

export async function completeFile(file) {
  if (file.status === "ready") throw new HttpError(409, "This upload is already finished.");
  const received = (await receivedCounts([file.id])).get(file.id) ?? 0;
  if (received !== file.chunkCount) throw new HttpError(409, "Some parts are missing. Retrying.");

  const updated = await db
    .update(transferFiles)
    .set({ status: "ready" })
    .where(and(eq(transferFiles.id, file.id), eq(transferFiles.status, "uploading")))
    .returning();
  if (!updated.length) throw new HttpError(409, "This upload is already finished.");

  const chat = await getChat(file.chatId);
  const message = await addMessage(chat, file.sender, { fileId: file.id });
  return { chat, message: messageView(message, new Map([[file.id, updated[0]]])) };
}

/**
 * Stores a file that arrives as a stream of unknown length, for uploads made
 * on the server (the agent API). Parts are cut to CHUNK_SIZE as bytes arrive.
 */
export async function ingestFile(chat, role, { name, type }, source) {
  assertOpen(chat, role);
  const [file] = await db
    .insert(transferFiles)
    .values({
      id: randomId(16),
      chatId: chat.id,
      sender: role,
      name: cleanFileName(name),
      type: cleanType(type),
      size: 0,
      chunkSize: CHUNK_SIZE,
      chunkCount: 0,
      createdAt: Date.now(),
      expiresAt: expiresOf(chat),
    })
    .returning();

  let size = 0;
  let index = 0;
  let pending = [];
  let pendingBytes = 0;
  const flush = async (bytes) => {
    const data = Buffer.concat(pending, pendingBytes);
    const part = data.subarray(0, bytes);
    const rest = data.subarray(bytes);
    await db.insert(transferChunks).values({ fileId: file.id, index, data: seal(part) });
    index += 1;
    pending = rest.length ? [rest] : [];
    pendingBytes = rest.length;
  };

  try {
    for await (const piece of source) {
      const bytes = Buffer.from(piece);
      size += bytes.length;
      if (size > MAX_FILE_BYTES) throw new HttpError(413, "Files can be up to 2 GB each.");
      pending.push(bytes);
      pendingBytes += bytes.length;
      while (pendingBytes >= CHUNK_SIZE) await flush(CHUNK_SIZE);
    }
    if (pendingBytes > 0 || index === 0) await flush(pendingBytes);
    await db.update(transferFiles).set({ size, chunkCount: index }).where(eq(transferFiles.id, file.id));
    return await completeFile({ ...file, size, chunkCount: index });
  } catch (error) {
    await deleteFileRows([file.id]);
    throw error;
  }
}

export async function deleteFile(file) {
  await deleteFileRows([file.id]);
}

/** Streams the decrypted file part by part, so large files never sit in memory. */
export function fileStream(file) {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index >= file.chunkCount) return controller.close();
      const row = await db.query.transferChunks.findFirst({
        where: and(eq(transferChunks.fileId, file.id), eq(transferChunks.index, index)),
      });
      if (!row) return controller.error(new Error("Missing part"));
      controller.enqueue(new Uint8Array(unseal(row.data)));
      index += 1;
    },
  });
}

/* Admin overview */

export async function listChats() {
  const unread = db
    .select({ chatId: transferMessages.chatId, total: count().as("total") })
    .from(transferMessages)
    .innerJoin(transferChats, eq(transferChats.id, transferMessages.chatId))
    .where(and(eq(transferMessages.sender, "guest"), gt(transferMessages.id, transferChats.adminReadId)))
    .groupBy(transferMessages.chatId)
    .as("unread");

  const chats = await db
    .select({ chat: transferChats, unread: unread.total })
    .from(transferChats)
    .leftJoin(unread, eq(unread.chatId, transferChats.id))
    .orderBy(desc(transferChats.activeAt));

  const ids = chats.map((row) => row.chat.id);
  const last = ids.length
    ? await db
        .select()
        .from(transferMessages)
        .where(
          inArray(
            transferMessages.id,
            db.select({ id: sql`max(${transferMessages.id})` }).from(transferMessages).groupBy(transferMessages.chatId),
          ),
        )
    : [];
  const lastFiles = last.filter((message) => message.fileId).map((message) => message.fileId);
  const files = lastFiles.length ? await db.select().from(transferFiles).where(inArray(transferFiles.id, lastFiles)) : [];
  const filesById = new Map(files.map((file) => [file.id, file]));
  const lastByChat = new Map(last.map((message) => [message.chatId, messageView(message, filesById)]));

  const now = Date.now();
  return chats.map(({ chat, unread: total }) => ({
    ...chatView(chat, "admin"),
    activeAt: chat.activeAt,
    unread: total ?? 0,
    online: now - (chat.guestSeenAt ?? 0) < ONLINE_MS,
    typing: now - (chat.guestTypingAt ?? 0) < TYPING_MS,
    last: lastByChat.get(chat.id) ?? null,
  }));
}

export async function listFiles() {
  const rows = await db
    .select({ file: transferFiles, chatName: transferChats.name })
    .from(transferFiles)
    .innerJoin(transferChats, eq(transferChats.id, transferFiles.chatId))
    .where(eq(transferFiles.status, "ready"))
    .orderBy(desc(transferFiles.createdAt));
  return rows.map(({ file, chatName }) => ({
    ...fileView(file),
    chatId: file.chatId,
    chatName,
    createdAt: file.createdAt,
    expiresAt: file.expiresAt,
  }));
}
