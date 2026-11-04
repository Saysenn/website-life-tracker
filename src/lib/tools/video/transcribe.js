import { fmtTime } from "./frames";

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const RATE = 16000;

export const MODELS = [
  { value: "onnx-community/whisper-tiny", label: "Fast", note: "≈40 MB download" },
  { value: "onnx-community/whisper-base", label: "Balanced", note: "≈80 MB download" },
  { value: "onnx-community/whisper-small", label: "Accurate", note: "≈250 MB, slower" },
];

export const LANGUAGES = [
  ["", "Detect automatically"],
  ["english", "English"],
  ["tagalog", "Filipino / Tagalog"],
  ["spanish", "Spanish"],
  ["french", "French"],
  ["german", "German"],
  ["portuguese", "Portuguese"],
  ["italian", "Italian"],
  ["dutch", "Dutch"],
  ["arabic", "Arabic"],
  ["hindi", "Hindi"],
  ["chinese", "Chinese"],
  ["japanese", "Japanese"],
  ["korean", "Korean"],
  ["russian", "Russian"],
  ["turkish", "Turkish"],
  ["indonesian", "Indonesian"],
  ["vietnamese", "Vietnamese"],
  ["thai", "Thai"],
];

/** Decodes the soundtrack to 16 kHz mono, which is what Whisper expects. */
export async function decodeAudio(file) {
  const buffer = await file.arrayBuffer();
  const context = new AudioContext();
  let decoded;
  try {
    decoded = await context.decodeAudioData(buffer);
  } catch {
    throw new Error("Couldn't read the sound in this video. It may have no audio track, or use a format this browser can't decode.");
  } finally {
    context.close();
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

const rms = (samples, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};

/** Splits audio into ≤30 s windows, cutting in the quietest spot so words aren't chopped. */
export function planWindows(samples) {
  const windows = [];
  let start = 0;
  const hop = RATE / 10;
  while (start < samples.length) {
    let end = Math.min(samples.length, start + 29.5 * RATE);
    if (end < samples.length) {
      let best = end;
      let quietest = Infinity;
      for (let at = start + 22 * RATE; at + hop <= end; at += hop) {
        const level = rms(samples, at, at + hop);
        if (level < quietest) {
          quietest = level;
          best = at + hop / 2;
        }
      }
      end = Math.round(best);
    }
    windows.push({ start, end, silent: rms(samples, start, end) < 0.004 });
    start = end;
  }
  return windows;
}

const WORKER = `
import { pipeline, env } from "${TRANSFORMERS}";
env.allowLocalModels = false;
let asr = null;
let loaded = "";
async function load(model) {
  if (asr && loaded === model) return;
  const gpu = "gpu" in navigator && (await navigator.gpu.requestAdapter().catch(() => null));
  const progress_callback = (p) => self.postMessage({ type: "download", file: p.file, loaded: p.loaded, total: p.total, status: p.status });
  try {
    asr = await pipeline("automatic-speech-recognition", model, gpu
      ? { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback }
      : { device: "wasm", dtype: "q8", progress_callback });
  } catch (error) {
    if (!gpu) throw error;
    asr = await pipeline("automatic-speech-recognition", model, { device: "wasm", dtype: "q8", progress_callback });
  }
  loaded = model;
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await load(data.model);
      self.postMessage({ type: "ready" });
    } else if (data.type === "run") {
      const options = { return_timestamps: true, task: data.task };
      if (data.language) options.language = data.language;
      const out = await asr(data.audio, options);
      self.postMessage({ type: "result", id: data.id, out });
    }
  } catch (error) {
    self.postMessage({ type: "error", id: data.id, message: error?.message || String(error) });
  }
};
`;

let worker = null;

function getWorker() {
  if (!worker) {
    const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    worker = new Worker(url, { type: "module" });
  }
  return worker;
}

function call(message, onEvent) {
  const target = getWorker();
  return new Promise((resolve, reject) => {
    const listen = ({ data }) => {
      if (data.type === "download") return onEvent?.(data);
      target.removeEventListener("message", listen);
      if (data.type === "error") reject(new Error(data.message));
      else resolve(data);
    };
    target.addEventListener("message", listen);
    target.postMessage(message, message.audio ? [message.audio.buffer] : []);
  });
}

/** Stops whatever the worker is doing (the model has to load again next time). */
export function stopTranscriber() {
  worker?.terminate();
  worker = null;
}

const HALLUCINATIONS = /^(\[.*\]|\(.*\)|♪+|thank you\.?|thanks for watching!?|you)$/i;

/**
 * Transcribes a decoded soundtrack. Reports {phase, progress, detail}; returns
 * segments [{start, end, text}] in seconds.
 */
export async function transcribe(samples, { model, language, translate, onProgress, onSegment, cancelled }) {
  const files = {};
  onProgress({ phase: "model", progress: 0, detail: "Loading speech model…" });
  await call({ type: "load", model }, (event) => {
    if (!event.file || !event.total) return;
    files[event.file] = { loaded: event.loaded ?? 0, total: event.total };
    const all = Object.values(files);
    const loaded = all.reduce((sum, item) => sum + item.loaded, 0);
    const total = all.reduce((sum, item) => sum + item.total, 0);
    onProgress({
      phase: "model",
      progress: loaded / total,
      detail: `Downloading speech model ${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB (only the first time)`,
    });
  });

  const windows = planWindows(samples);
  const duration = samples.length / RATE;
  const segments = [];
  for (const [index, window] of windows.entries()) {
    if (cancelled()) break;
    const offset = window.start / RATE;
    onProgress({
      phase: "transcribe",
      progress: index / windows.length,
      detail: `Listening… ${fmtTime(offset)} of ${fmtTime(duration)}`,
    });
    if (window.silent) continue;
    const audio = samples.slice(window.start, window.end);
    const { out } = await call({ type: "run", id: index, audio, language, task: translate ? "translate" : "transcribe" });
    const windowEnd = window.end / RATE;
    for (const chunk of out.chunks ?? [{ timestamp: [0, null], text: out.text }]) {
      const text = chunk.text.trim();
      if (!text || HALLUCINATIONS.test(text)) continue;
      const [from, to] = chunk.timestamp;
      const segment = {
        start: offset + (from ?? 0),
        end: Math.min(windowEnd, to == null ? windowEnd : offset + to),
        text,
      };
      // Whisper sometimes repeats the previous line at a window edge.
      if (segments.at(-1)?.text === text) continue;
      segments.push(segment);
      onSegment?.(segment);
    }
  }
  onProgress({ phase: "done", progress: 1, detail: "" });
  return segments;
}

/* ---------- export formats ---------- */

const stamp = (seconds, sep) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000) % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(ms).padStart(3, "0")}`;
};

export const toPlainText = (segments, timestamps = false) =>
  segments.map((segment) => (timestamps ? `[${fmtTime(segment.start)}] ${segment.text}` : segment.text)).join(timestamps ? "\n" : " ");

export const toSrt = (segments) =>
  segments.map((segment, index) => `${index + 1}\n${stamp(segment.start, ",")} --> ${stamp(segment.end, ",")}\n${segment.text}\n`).join("\n");

export const toVtt = (segments) =>
  `WEBVTT\n\n${segments.map((segment) => `${stamp(segment.start, ".")} --> ${stamp(segment.end, ".")}\n${segment.text}\n`).join("\n")}`;
