import "server-only";
import { canScrub, scrubBytes } from "@/lib/tools/scrub";
import { fileStream } from "./store";

function concat(parts, size) {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Re-attaches an already read first part in front of the rest of the stream. */
function resume(head, reader) {
  return new ReadableStream({
    start(controller) {
      if (head.length) controller.enqueue(head);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * A stored file ready to send with its metadata stripped. `body` is either the
 * cleaned bytes, or the original stream when the file can't be cleaned
 * (unsupported type or over the size limit). `size` is the length of `body`.
 */
export async function scrubbedFile(file) {
  const reader = fileStream(file).getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array(0);
  if (first.done || !canScrub(head, file.name, file.size)) {
    return { body: resume(head, reader), size: file.size };
  }

  const parts = [head];
  let size = head.length;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  const cleaned = await scrubBytes(concat(parts, size), file.name);
  return { body: cleaned, size: cleaned.length };
}
