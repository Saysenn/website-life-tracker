/**
 * Getting pixels in: the screen (full, a window or a tab, optionally kept shared for instant repeats),
 * the clipboard, image files, and frames sent by the companion extension.
 */

let shared = null;

const live = (stream) => stream?.getVideoTracks().some((track) => track.readyState === "live");

export function isShared() {
  return live(shared);
}

/** Stops the kept screen share (the browser's "sharing" bar goes away). */
export function stopSharing() {
  shared?.getTracks().forEach((track) => track.stop());
  shared = null;
}

/**
 * A screen stream: the kept one when it's still live, otherwise the browser's picker.
 * `surface` hints which tab of the picker opens first: "monitor", "window" or "browser".
 */
export async function screenStream({ surface = "monitor", keep = false } = {}) {
  if (keep && live(shared)) return { stream: shared, kept: true };
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("This browser can't capture the screen — paste or open an image instead.");
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: surface, frameRate: 30, width: { ideal: 7680 }, height: { ideal: 4320 } },
    audio: false,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "include",
  });
  if (keep) {
    stopSharing();
    shared = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (shared === stream) shared = null;
    });
  }
  return { stream, kept: false };
}

/** One full-resolution frame from a screen stream. */
export async function grabFrame(stream) {
  const track = stream.getVideoTracks()[0];
  const surface = track.getSettings?.().displaySurface ?? "monitor";
  if ("ImageCapture" in window) {
    try {
      const bitmap = await new window.ImageCapture(track).grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return { canvas, surface };
    } catch {
      // Falls through to the video element.
    }
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => resolve()) : setTimeout(resolve, 120)));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  video.pause();
  video.srcObject = null;
  return { canvas, surface };
}

/** A canvas holding just part of another. */
export function cropCanvas(canvas, { x, y, w, h }) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  out.getContext("2d").drawImage(canvas, Math.round(x), Math.round(y), out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** An image file or blob drawn onto a canvas. */
export async function blobToCanvas(blob) {
  let source;
  try {
    source = await createImageBitmap(blob);
  } catch {
    source = await new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("That file isn't an image this browser can open"));
      };
      image.src = url;
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = source.width || source.naturalWidth;
  canvas.height = source.height || source.naturalHeight;
  canvas.getContext("2d").drawImage(source, 0, 0);
  source.close?.();
  return canvas;
}

export async function urlToCanvas(url) {
  return blobToCanvas(await (await fetch(url)).blob());
}

/** The first image on the clipboard (needs a click or ⌘V; the browser may ask). */
export async function clipboardImage() {
  if (!navigator.clipboard?.read) throw new Error("This browser can't read pictures from the clipboard — press ⌘V / Ctrl V on the page instead.");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}

/**
 * Joins the frames of a scrolling page capture from the extension.
 * frames: [{ url, y }] where y is the CSS scroll offset; `height` is the page height and `viewWidth`
 * the window width, both in CSS px. Returns the tall canvas and its pixels per CSS px.
 */
export async function stitch({ frames, height, viewWidth }) {
  const images = [];
  for (const frame of frames) images.push({ y: frame.y, canvas: await urlToCanvas(frame.url) });
  const width = images[0].canvas.width;
  const dpr = viewWidth ? width / viewWidth : 1;
  const out = document.createElement("canvas");
  out.width = width;
  // Browsers can't make canvases much taller than this; very long pages are cut off.
  out.height = Math.min(Math.round(height * dpr), 32_000);
  const ctx = out.getContext("2d");
  for (const { y, canvas } of images) ctx.drawImage(canvas, 0, Math.round(y * dpr));
  return { canvas: out, dpr };
}

let audio = null;

/** A short camera-shutter click, made on the fly. */
export function shutter() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    const length = Math.floor(audio.sampleRate * 0.09);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      // Two quick clicks of filtered noise: the shutter opening and closing.
      const envelope = (t < 0.35 ? Math.exp(-t * 28) : Math.exp(-(t - 0.45) * 30) * (t > 0.45 ? 0.8 : 0)) * 0.9;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2600;
    filter.Q.value = 0.8;
    const gain = audio.createGain();
    gain.gain.value = 0.6;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(now);
  } catch {
    // Sound is a nicety; never block a capture on it.
  }
}
