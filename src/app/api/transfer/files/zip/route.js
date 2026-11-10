import { Zip, ZipPassThrough } from "fflate";
import { HttpError, guestChat, isAdminRequest, route } from "@/lib/transfer/access";
import { fileStream, getChat, readyFiles } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Plain zip has no 64 bit sizes, so one download stays under 4 GB. */
const ZIP_LIMIT = 4 * 1024 ** 3 - 64 * 1024 ** 2;

const safe = (name) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim() || "file";

function uniquePaths(files, folders) {
  const used = new Set();
  return files.map((file) => {
    const folder = folders ? `${safe(file.chatName)}/` : "";
    const dot = file.name.lastIndexOf(".");
    const base = safe(dot > 0 ? file.name.slice(0, dot) : file.name);
    const ext = dot > 0 ? safe(file.name.slice(dot)) : "";
    let path = `${folder}${base}${ext}`;
    for (let copy = 2; used.has(path.toLowerCase()); copy += 1) path = `${folder}${base} (${copy})${ext}`;
    used.add(path.toLowerCase());
    return path;
  });
}

/** Streams a stored (uncompressed) zip, reading one encrypted chunk at a time. */
function zipStream(files, paths) {
  let out = [];
  let failed = null;
  const zip = new Zip((error, data) => {
    if (error) failed = error;
    else out.push(data);
  });

  async function* parts() {
    for (const [index, file] of files.entries()) {
      const entry = new ZipPassThrough(paths[index]);
      entry.mtime = new Date(file.createdAt);
      zip.add(entry);
      const reader = fileStream(file).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        entry.push(value ?? new Uint8Array(0), done);
        if (failed) throw failed;
        if (out.length) yield* out.splice(0);
        if (done) break;
      }
    }
    zip.end();
    if (failed) throw failed;
    yield* out.splice(0);
  }

  const iterator = parts();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel() {
      iterator.return();
    },
  });
}

/** ?chat=<id> for one chat, ?all=1 for every file (admin only). Guests always get their own chat. */
export const GET = route(async (request) => {
  const params = request.nextUrl.searchParams;
  let chatId = null;
  if (await isAdminRequest()) {
    if (params.get("all") !== "1") chatId = (await getChat(params.get("chat") ?? "")).id;
  } else {
    const chat = await guestChat();
    if (!chat) throw new HttpError(401, "Your session has ended.");
    chatId = chat.id;
  }

  const files = await readyFiles(chatId);
  if (!files.length) throw new HttpError(404, "There are no files to download yet.");
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > ZIP_LIMIT) throw new HttpError(413, "That is over 4 GB. Download the files one by one.");

  const stamp = new Date().toISOString().slice(0, 10);
  const label = chatId ? safe(files[0].chatName) : "All files";
  const name = `${label} ${stamp}.zip`;
  return new Response(zipStream(files, uniquePaths(files, !chatId)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7E]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
