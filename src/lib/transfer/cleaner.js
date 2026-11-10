import "server-only";
import { cleanBytes } from "@/lib/tools/strip-metadata";
import { HttpError } from "./access";
import { nameFromResponse, safeFetch, target } from "./agent";
import { notifyAdmin } from "./notify";
import { fileStream, getFile, ingestFile } from "./store";

/** Cleaning works on the whole file in memory, so it is capped well below the transfer limit. */
const CLEAN_LIMIT = 150 * 1024 * 1024;
const INLINE_LIMIT = 3 * 1024 * 1024;
const BASE64_LIMIT = 3 * 1024 * 1024;

async function collect(source) {
  const parts = [];
  let size = 0;
  for await (const part of source) {
    size += part.length;
    if (size > CLEAN_LIMIT) throw new HttpError(413, "Files over 150 MB are too large to clean here.");
    parts.push(Buffer.from(part));
  }
  return new Uint8Array(Buffer.concat(parts, size));
}

async function load({ file_id, source_url, content_base64, file_name, mime_type }) {
  if (file_id) {
    const file = await getFile(file_id);
    if (file.status !== "ready") throw new HttpError(409, "That file is still uploading.");
    if (file.size > CLEAN_LIMIT) throw new HttpError(413, "Files over 150 MB are too large to clean here.");
    return { bytes: await collect(fileStream(file)), name: file.name, type: file.type };
  }
  if (source_url) {
    const { response, url } = await safeFetch(source_url);
    const type = mime_type || response.headers.get("content-type")?.split(";")[0];
    return { bytes: await collect(response.body), name: file_name || nameFromResponse(response, url), type };
  }
  if (content_base64) {
    if (!file_name) throw new HttpError(400, "file_name is required with content_base64.");
    const bytes = Buffer.from(content_base64, "base64");
    if (bytes.length > BASE64_LIMIT) throw new HttpError(413, "Use source_url or file_id for files over 3 MB.");
    return { bytes: new Uint8Array(bytes), name: file_name, type: mime_type };
  }
  throw new HttpError(400, "Give file_id, source_url or content_base64.");
}

const cleanName = (name) => name.replace(/(\.[^.]+)?$/, (ext) => `-clean${ext}`);

export const CLEANER_TOOLS = [
  {
    name: "clean_metadata",
    description:
      "Strips hidden metadata (GPS location, camera and serial number, author, owner, edit history, dates, comments) without touching quality. " +
      "Works on JPG, PNG, WebP, GIF, SVG, PDF, Word, Excel, PowerPoint, OpenDocument, MP3, MP4, MOV and M4A, up to 150 MB. " +
      "Give file_id (from the file transfer server), source_url (https) or content_base64 with file_name. " +
      "The cleaned copy goes to the admin's Grok chat, or to a visitor as the admin when chat_id is given. Files of 3 MB or less also come back inline.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "A file from the file transfer server" },
        source_url: { type: "string", description: "https link to download the file from" },
        content_base64: { type: "string", description: "The file itself, base64 encoded, up to 3 MB" },
        file_name: { type: "string", description: "Required with content_base64" },
        mime_type: { type: "string" },
        chat_id: { type: "string", description: "Send the cleaned file to this visitor. Leave out to deliver it to the admin" },
      },
    },
    run: async (args) => {
      const source = await load(args);
      let result;
      try {
        result = await cleanBytes(source.bytes, source.name);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, `${source.name}: ${error.message}`);
      }

      const { chat, role } = await target(args.chat_id);
      const name = cleanName(source.name);
      const { message } = await ingestFile(chat, role, { name, type: source.type }, [result.bytes]);
      if (role === "guest") notifyAdmin({ type: "file", chat, name, size: result.bytes.length });

      const summary = {
        cleaned: true,
        name,
        removed: result.removed,
        note: result.note ?? undefined,
        size_before: source.bytes.length,
        size_after: result.bytes.length,
        saved_to: { chat_id: chat.id, chat: chat.name, file_id: message.file.id },
      };
      const content = [{ type: "text", text: JSON.stringify(summary, null, 2) }];
      if (result.bytes.length <= INLINE_LIMIT) {
        content.push({
          type: "resource",
          resource: {
            uri: `file:///${encodeURIComponent(name)}`,
            mimeType: source.type || "application/octet-stream",
            blob: Buffer.from(result.bytes).toString("base64"),
          },
        });
      }
      return { content };
    },
  },
];
