import { difference, fingerprint, grab, openVideo, seek } from "./frames";

const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js";

export const OCR_LANGUAGES = [
  ["eng", "English"],
  ["tgl", "Filipino / Tagalog"],
  ["spa", "Spanish"],
  ["fra", "French"],
  ["deu", "German"],
  ["por", "Portuguese"],
  ["ita", "Italian"],
  ["nld", "Dutch"],
  ["ara", "Arabic"],
  ["hin", "Hindi"],
  ["chi_sim", "Chinese (Simplified)"],
  ["jpn", "Japanese"],
  ["kor", "Korean"],
  ["rus", "Russian"],
];

// Loaded from the CDN at runtime so the bundler never touches it.
const importUrl = (url) => new Function("url", "return import(url)")(url);

const words = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

function similarity(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return shared / Math.min(x.size, y.size);
}

/** Drops OCR junk: lines that are mostly symbols or a single stray character. */
function clean(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      const letters = (line.match(/[\p{L}\p{N}]/gu) ?? []).length;
      return letters >= 2 && letters / line.length > 0.5;
    })
    .join("\n");
}

/** Prepares a frame for OCR: big enough to read, greyscale, stretched contrast. */
function prepare(video) {
  const canvas = grab(video, 1920);
  if (canvas.width < 1280) {
    const scale = 1280 / canvas.width;
    const big = document.createElement("canvas");
    big.width = 1280;
    big.height = Math.round(canvas.height * scale);
    big.getContext("2d").drawImage(canvas, 0, 0, big.width, big.height);
    return big;
  }
  return canvas;
}

/**
 * Reads the text shown on screen. Frames that look the same as the last one
 * read are skipped, and repeated text is merged into one entry with a time range.
 */
export async function readScreenText(src, { language, every, onProgress, onEntry, cancelled }) {
  onProgress({ progress: 0, detail: "Loading text reader…" });
  const Tesseract = await importUrl(TESSERACT);
  const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
  const worker = await createWorker(language, 1, {
    logger: (event) => {
      if (event.status?.includes("loading") && event.progress < 1) {
        onProgress({ progress: 0, detail: `Downloading ${language} text data… ${Math.round(event.progress * 100)}%` });
      }
    },
  });

  const video = await openVideo(src);
  const entries = [];
  try {
    const duration = video.duration;
    let lastPrint = null;
    let showing = null;
    for (let time = 0; time < duration; time += every) {
      if (cancelled()) break;
      onProgress({ progress: time / duration, detail: `Reading frames… ${Math.round((time / duration) * 100)}%` });
      await seek(video, time);
      const print = fingerprint(video);
      const end = Math.min(duration, time + every);
      if (difference(print, lastPrint) < 0.015) {
        // Same screen as last time: it's still showing whatever we read then.
        if (showing) {
          showing.end = end;
          onEntry({ ...showing }, true);
        }
        continue;
      }
      lastPrint = print;
      const {
        data: { text },
      } = await worker.recognize(prepare(video));
      const found = clean(text);
      if (!found) {
        showing = null;
        continue;
      }
      const previous = entries.at(-1);
      if (previous && similarity(previous.text, found) > 0.8) {
        previous.end = end;
        if (found.length > previous.text.length) previous.text = found;
        showing = previous;
        onEntry({ ...previous }, true);
        continue;
      }
      showing = { id: `${time}`, start: time, end, text: found };
      entries.push(showing);
      onEntry({ ...showing }, false);
    }
  } finally {
    await worker.terminate();
    video.removeAttribute("src");
    video.load();
  }
  onProgress({ progress: 1, detail: "" });
  return entries;
}
