import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./access";
import { HOST_NAME, INLINE_TYPES } from "./constants";
import { sameText } from "./crypto";
import { notifyAdmin } from "./notify";
import {
  agentChat,
  deleteChat,
  fileStream,
  getChat,
  getFile,
  getLinkKey,
  ingestFile,
  listChats,
  listFiles,
  postMessage,
  purgeExpired,
  setBlocked,
  syncChat,
} from "./store";

const READ_LIMIT = 3 * 1024 * 1024;
const BASE64_LIMIT = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/**
 * The key comes either in the link (/api/mcp/<key>, for assistants that only take a URL)
 * or as a Bearer token. With AGENT_API_KEY unset the agent API does not exist.
 */
export function agentAccess(request) {
  const key = process.env.AGENT_API_KEY?.trim();
  if (!key) return "disabled";
  const header = request.headers.get("authorization") ?? "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const fromPath = decodeURIComponent(request.nextUrl.pathname.match(/^\/api\/mcp\/([^/]+)$/)?.[1] ?? "");
  const token = fromHeader || fromPath;
  return token && sameText(token, key) ? "ok" : "denied";
}

/** No chat_id means the assistant is delivering to the admin, so it goes in the Grok chat as incoming. */
async function target(chat_id) {
  if (chat_id) return { chat: await getChat(chat_id), role: "admin" };
  const { chat, created } = await agentChat();
  if (created) notifyAdmin({ type: "start", chat });
  return { chat, role: "guest" };
}

function appUrl() {
  const value = (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (!value) return "";
  return (/^https?:\/\//.test(value) ? value : `https://${value}`).replace(/\/+$/, "");
}

/* Fetching a file from a link, without letting the link reach private networks. */

function privateAddress(address) {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
    return lower === "::1" || lower === "::" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function safeFetch(link) {
  let url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      url = new URL(link, url);
    } catch {
      throw new HttpError(400, "That link is not valid.");
    }
    if (url.protocol !== "https:") throw new HttpError(400, "Only https links can be fetched.");
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
      throw new HttpError(400, "That link points somewhere that cannot be fetched.");
    }
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(240_000) });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      link = response.headers.get("location");
      continue;
    }
    if (!response.ok || !response.body) throw new HttpError(400, `The link answered with status ${response.status}.`);
    return { response, url };
  }
  throw new HttpError(400, "That link redirects too many times.");
}

function nameFromResponse(response, url) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {}
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  return decodeURIComponent(url.pathname.split("/").pop() || "") || "download";
}

/* Tools */

const chatId = { type: "string", description: "Chat id from list_chats" };

export const TOOLS = [
  {
    name: "get_transfer_link",
    description: "Returns the public link people open to send files and chat with the admin.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ link: `${appUrl()}/send/${await getLinkKey()}` }),
  },
  {
    name: "list_chats",
    description:
      "Lists every file transfer chat from the last 24 hours, newest activity first, with the visitor's name, IP, location, unread count and last message.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      await purgeExpired();
      return (await listChats()).map((chat) => ({
        id: chat.id,
        name: chat.name,
        ip: chat.ip,
        location: chat.location,
        online: chat.online,
        unread: chat.unread,
        closed: chat.blocked,
        lastActivity: new Date(chat.activeAt).toISOString(),
        deletesAt: new Date(chat.expiresAt).toISOString(),
        lastMessage: chat.last ? (chat.last.file ? `[file] ${chat.last.file.name}` : chat.last.body) : null,
      }));
    },
  },
  {
    name: "read_chat",
    description:
      "Reads the messages in one chat, oldest first. Files appear with their file_id, which read_file accepts. Pass after (a message id) to get only newer messages. Reading does not mark anything as read.",
    inputSchema: {
      type: "object",
      properties: { chat_id: chatId, after: { type: "integer", description: "Only messages after this id" } },
      required: ["chat_id"],
    },
    run: async ({ chat_id, after = 0 }) => {
      const data = await syncChat(await getChat(chat_id), "admin", { after, touch: false });
      return {
        chat: { ...data.chat, createdAt: new Date(data.chat.createdAt).toISOString(), expiresAt: new Date(data.chat.expiresAt).toISOString() },
        visitorOnline: data.peer.online,
        messages: data.messages.map((message) => ({
          id: message.id,
          from: message.sender === "admin" ? HOST_NAME : data.chat.name,
          at: new Date(message.createdAt).toISOString(),
          text: message.body ?? undefined,
          file: message.file
            ? { file_id: message.file.id, name: message.file.name, type: message.file.type, size: message.file.size, status: data.files[message.file.id] ?? "removed" }
            : undefined,
        })),
        uploadingNow: data.incoming.map((file) => ({ name: file.name, size: file.size, progress: Math.round(file.progress * 100) })),
      };
    },
  },
  {
    name: "send_message",
    description:
      "Sends a text message. Without chat_id it goes to the admin in the Grok chat. With a chat_id it answers that visitor as the admin.",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Leave out to message the admin" },
        text: { type: "string", description: "Up to 4000 characters" },
      },
      required: ["text"],
    },
    run: async ({ chat_id, text }) => {
      const { chat, role } = await target(chat_id);
      const message = await postMessage(chat, role, text);
      if (role === "guest") notifyAdmin({ type: "message", chat });
      return { sent: true, chat_id: chat.id, message_id: message.id };
    },
  },
  {
    name: "upload_file",
    description:
      "Sends a file. Without chat_id it is delivered to the admin in the Grok chat. With a chat_id it goes to that visitor as the admin. Give either source_url (an https link the server downloads, up to 2 GB) or content_base64 (up to 3 MB) with file_name.",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Leave out to deliver the file to the admin" },
        source_url: { type: "string", description: "https link to download the file from" },
        content_base64: { type: "string", description: "The file itself, base64 encoded" },
        file_name: { type: "string", description: "Name to show. Required with content_base64" },
        mime_type: { type: "string", description: "For example application/pdf" },
      },
    },
    run: async ({ chat_id, source_url, content_base64, file_name, mime_type }) => {
      const { chat, role } = await target(chat_id);
      let result;
      if (source_url) {
        const { response, url } = await safeFetch(source_url);
        const type = mime_type || response.headers.get("content-type")?.split(";")[0];
        result = await ingestFile(chat, role, { name: file_name || nameFromResponse(response, url), type }, response.body);
      } else if (content_base64) {
        if (!file_name) throw new HttpError(400, "file_name is required with content_base64.");
        const data = Buffer.from(content_base64, "base64");
        if (data.length > BASE64_LIMIT) throw new HttpError(413, "Use source_url for files over 3 MB.");
        result = await ingestFile(chat, role, { name: file_name, type: mime_type }, [data]);
      } else {
        throw new HttpError(400, "Give source_url or content_base64.");
      }
      const { file } = result.message;
      if (role === "guest") notifyAdmin({ type: "file", chat: result.chat, name: file.name, size: file.size });
      return { sent: true, chat_id: chat.id, file_id: file.id, name: file.name, size: file.size };
    },
  },
  {
    name: "list_files",
    description: "Lists every file sent either way in the last 24 hours, with who sent it and when it gets deleted.",
    inputSchema: { type: "object", properties: {} },
    run: async () =>
      (await listFiles()).map((file) => ({
        file_id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        chat_id: file.chatId,
        direction: file.sender === "guest" ? `from ${file.chatName}` : `to ${file.chatName}`,
        sentAt: new Date(file.createdAt).toISOString(),
        deletesAt: new Date(file.expiresAt).toISOString(),
      })),
  },
  {
    name: "read_file",
    description:
      "Returns the contents of a file up to 3 MB: text files as text, images as images, anything else as base64.",
    inputSchema: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] },
    run: async ({ file_id }) => {
      const file = await getFile(file_id);
      if (file.status !== "ready") throw new HttpError(409, "That file is still uploading.");
      if (file.size > READ_LIMIT) throw new HttpError(413, `${file.name} is too large to read here (over 3 MB).`);
      const parts = [];
      for await (const part of fileStream(file)) parts.push(part);
      const data = Buffer.concat(parts);
      if (INLINE_TYPES.includes(file.type)) return { content: [{ type: "image", data: data.toString("base64"), mimeType: file.type }] };
      if (/^text\/|json|xml|csv|javascript/.test(file.type)) return { content: [{ type: "text", text: data.toString("utf8") }] };
      return { name: file.name, type: file.type, content_base64: data.toString("base64") };
    },
  },
  {
    name: "close_chat",
    description: "Closes a chat so the visitor can no longer send anything, or reopens it with closed set to false.",
    inputSchema: {
      type: "object",
      properties: { chat_id: chatId, closed: { type: "boolean", default: true } },
      required: ["chat_id"],
    },
    run: async ({ chat_id, closed = true }) => {
      await setBlocked(chat_id, closed);
      return { chat_id, closed };
    },
  },
  {
    name: "delete_chat",
    description: "Permanently deletes a chat with every message and file in it, for both sides.",
    inputSchema: { type: "object", properties: { chat_id: chatId }, required: ["chat_id"] },
    run: async ({ chat_id }) => {
      await getChat(chat_id);
      await deleteChat(chat_id);
      return { deleted: true };
    },
  },
];

export async function runTool(name, args = {}) {
  const tool = TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new HttpError(404, `Unknown tool ${name}.`);
  const result = await tool.run(args ?? {});
  return result?.content ? result : { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

