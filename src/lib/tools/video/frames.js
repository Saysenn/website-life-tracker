export const FRAME_FORMATS = [
  { value: "jpg", label: "JPG", mime: "image/jpeg" },
  { value: "png", label: "PNG", mime: "image/png" },
  { value: "webp", label: "WEBP", mime: "image/webp" },
];

export const MAX_FRAMES = 1000;

/** Opens a video off-screen so frames can be grabbed without touching the visible player. */
export async function openVideo(src) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = src;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("This browser can't play this video format. Try MP4 (H.264) or WebM."));
  });
  // Some WebM files report Infinity until you seek to the end once.
  if (!Number.isFinite(video.duration)) {
    video.currentTime = 1e9;
    await new Promise((resolve) => (video.ondurationchange = () => Number.isFinite(video.duration) && resolve()));
    video.currentTime = 0;
  }
  if (!video.videoWidth) throw new Error("This file has no picture track");
  return video;
}

export function seek(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", done);
      reject(new Error("The video stopped responding while seeking"));
    }, 15000);
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
  });
}

export function grab(video, maxWidth = Infinity) {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Tiny greyscale fingerprint used to spot scene changes and repeated screens. */
export function fingerprint(source) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 27;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, 48, 27);
  const { data } = context.getImageData(0, 0, 48, 27);
  const out = new Float32Array(48 * 27);
  for (let i = 0; i < out.length; i++) out[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  return out;
}

/** 0 = identical, ~0.3+ = a different shot. */
export function difference(a, b) {
  if (!a || !b) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

const toBlob = (canvas, mime, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the frame"))), mime, quality),
  );

/** Times to look at for each mode. Scene mode samples densely and keeps only the changes. */
export function planTimes(duration, { mode, every, count }) {
  if (mode === "count") {
    const n = Math.max(1, Math.min(MAX_FRAMES, Math.round(count)));
    return Array.from({ length: n }, (_, i) => (duration * (i + 0.5)) / n);
  }
  const step = mode === "scenes" ? Math.max(0.25, duration / 1500) : Math.max(0.04, every);
  const times = [];
  for (let t = 0; t < duration && times.length < (mode === "scenes" ? 1500 : MAX_FRAMES); t += step) times.push(t);
  return times;
}

export const fmtTime = (seconds, withMs = false) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
  return `${h ? `${h}:` : ""}${mmss}${withMs ? `.${String(ms).padStart(3, "0")}` : ""}`;
};

/**
 * Pulls frames out of a video. Calls onFrame for each kept frame as it goes.
 * `cancelled()` is polled between frames.
 */
export async function extractFrames(src, { mode, every, count, sensitivity = 0.5, format, quality, maxWidth, onFrame, onProgress, cancelled }) {
  const video = await openVideo(src);
  const { mime } = FRAME_FORMATS.find((item) => item.value === format);
  const times = planTimes(video.duration, { mode, every, count });
  // Higher sensitivity = smaller change needed to count as a new scene.
  const threshold = 0.2 - sensitivity * 0.17;
  let last = null;
  let kept = 0;
  try {
    for (const [index, time] of times.entries()) {
      if (cancelled()) break;
      await seek(video, time);
      if (mode === "scenes") {
        const print = fingerprint(video);
        const changed = difference(print, last) > threshold;
        if (!changed) {
          onProgress((index + 1) / times.length);
          continue;
        }
        last = print;
      }
      const canvas = grab(video, maxWidth);
      const blob = await toBlob(canvas, mime, quality);
      onFrame({ id: `${time.toFixed(3)}`, time, blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
      onProgress((index + 1) / times.length);
      if (++kept >= MAX_FRAMES) break;
    }
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
