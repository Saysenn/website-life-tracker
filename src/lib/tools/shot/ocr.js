/**
 * Reading a screenshot: text with Tesseract (loaded from the CDN on first use, then cached by the browser)
 * and QR / barcodes with the browser's own BarcodeDetector where there is one.
 */

const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js";

// Loaded at runtime so the bundler never touches it.
const importUrl = (url) => new Function("url", "return import(url)")(url);

let workerFor = null;
let workerLanguage = null;

async function worker(language, onProgress) {
  if (workerFor && workerLanguage === language) return workerFor;
  if (workerFor) (await workerFor).terminate().catch(() => {});
  workerLanguage = language;
  workerFor = (async () => {
    const Tesseract = await importUrl(TESSERACT);
    const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
    return createWorker(language, 1, {
      logger: (event) => {
        if (event.status === "recognizing text") onProgress?.(0.4 + event.progress * 0.6, "Reading text");
        else if (event.progress) onProgress?.(event.progress * 0.4, "Loading the reader");
      },
    });
  })();
  workerFor.catch(() => {
    workerFor = null;
  });
  return workerFor;
}

/** Small text reads badly; scale it up and make it greyscale with stretched contrast first. */
function prepare(canvas) {
  const scale = canvas.width < 1400 ? Math.min(3, 1400 / canvas.width) : 1;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const { data } = image;
  let min = 255;
  let max = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  // Light text on a dark background reads better flipped.
  const invert = sum / (data.length / 4) < 110;
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    let v = ((data[i] - min) / range) * 255;
    if (invert) v = 255 - v;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

/** The text in a picture, line breaks kept. */
export async function readText(canvas, { language = "eng", onProgress } = {}) {
  const reader = await worker(language, onProgress);
  const { data } = await reader.recognize(prepare(canvas));
  onProgress?.(1, "Done");
  return (data.text || "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** QR codes and barcodes in a picture: [{ format, value }]. Empty where the browser can't detect them. */
export async function readCodes(canvas) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const detector = new window.BarcodeDetector();
    const found = await detector.detect(canvas);
    const seen = new Set();
    return found
      .filter((code) => code.rawValue && !seen.has(code.rawValue) && seen.add(code.rawValue))
      .map((code) => ({ format: code.format, value: code.rawValue }));
  } catch {
    return [];
  }
}

export const canReadCodes = () => typeof window !== "undefined" && "BarcodeDetector" in window;
