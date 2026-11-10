export async function call(url, { method = "POST", body } = {}) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "x-transfer": "1", ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again."), { status: response.status });
  return data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FATAL = [401, 403, 404, 409, 413];
const PARALLEL_PARTS = 3;

function putPart(url, blob, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-transfer", "1");
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status < 300) return resolve();
      let message = "Upload failed.";
      try {
        message = JSON.parse(xhr.responseText).error || message;
      } catch {}
      reject(Object.assign(new Error(message), { status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(new Error("Connection lost."), { status: 0 }));
    xhr.onabort = () => reject(Object.assign(new Error("Cancelled"), { aborted: true }));
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  });
}

/**
 * Sends a file in 3 MB parts, three at a time, retrying each part with backoff.
 * Calls onProgress with the total bytes sent so far.
 */
export async function uploadFile({ file, createUrl, onProgress, signal }) {
  const { id, chunkSize, chunkCount } = await call(createUrl, {
    body: { name: file.name, size: file.size, type: file.type },
  });
  const sent = new Array(chunkCount).fill(0);
  const report = () => onProgress(sent.reduce((total, value) => total + value, 0));
  let next = 0;

  const sendPart = async (index) => {
    const part = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
    for (let attempt = 0; ; attempt += 1) {
      try {
        await putPart(`/api/transfer/files/${id}/${index}`, part, (loaded) => {
          sent[index] = loaded;
          report();
        }, signal);
        sent[index] = part.size;
        report();
        return;
      } catch (error) {
        sent[index] = 0;
        report();
        if (error.aborted || FATAL.includes(error.status) || attempt >= 5) throw error;
        await wait(Math.min(15_000, 800 * 2 ** attempt));
        if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { aborted: true });
      }
    }
  };

  const worker = async () => {
    while (next < chunkCount) await sendPart(next++);
  };

  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, chunkCount) }, worker));
    return await call(`/api/transfer/files/${id}`);
  } catch (error) {
    call(`/api/transfer/files/${id}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
