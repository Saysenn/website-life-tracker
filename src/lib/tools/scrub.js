import { cleanBytes, detectKind } from "./strip-metadata";

/*
 * Best-effort metadata removal for file transfer. Runs in the browser before an
 * upload and on the server before a download. It never blocks a transfer: files
 * of a type we can't clean, files that are too big to hold in memory, or files
 * the cleaner chokes on simply pass through unchanged.
 */

/** Cleaning holds the whole file in memory, so very large files are passed through. */
export const SCRUB_LIMIT = 150 * 1024 * 1024;

const CLEANABLE = new Set(["jpeg", "png", "webp", "gif", "pdf", "mp4", "mp3", "office", "svg"]);

/** `head` only needs the first few bytes of the file to tell its type. */
export function canScrub(head, name, size) {
  return size > 0 && size <= SCRUB_LIMIT && CLEANABLE.has(detectKind(head, name));
}

/** Returns the cleaned bytes, or the original bytes if cleaning fails. */
export async function scrubBytes(bytes, name) {
  try {
    return (await cleanBytes(bytes, name)).bytes;
  } catch {
    return bytes;
  }
}

/** Browser: returns a cleaned copy of the File, or the same File when there is nothing to do. */
export async function scrubFile(file) {
  if (file.size > SCRUB_LIMIT) return file;
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (!canScrub(head, file.name, file.size)) return file;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cleaned = await scrubBytes(bytes, file.name);
  if (cleaned === bytes) return file;
  return new File([cleaned], file.name, { type: file.type, lastModified: Date.now() });
}
