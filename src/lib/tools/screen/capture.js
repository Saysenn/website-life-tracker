/** Building blocks for the screen recorder: picking sources, mixing sound, drawing overlays, and the recorder format. */

export const SURFACES = { screen: "monitor", window: "window", tab: "browser", area: undefined };

const VIDEO_TYPES = {
  mp4: ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4"],
  webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
};
const AUDIO_TYPES = {
  mp4: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"],
  webm: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"],
};

const supported = (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);

export function formatSupport() {
  return { mp4: VIDEO_TYPES.mp4.some(supported), webm: VIDEO_TYPES.webm.some(supported) };
}

/** The best recorder type for the wanted format, falling back to the other one. */
export function pickType(format, video = true) {
  const table = video ? VIDEO_TYPES : AUDIO_TYPES;
  const order = format === "webm" ? ["webm", "mp4"] : ["mp4", "webm"];
  for (const key of order) {
    const type = table[key].find(supported);
    if (type) return type;
  }
  return "";
}

export function extensionFor(type) {
  if (type.startsWith("video/mp4")) return "mp4";
  if (type.startsWith("audio/mp4")) return "m4a";
  if (type.startsWith("audio/ogg")) return "ogg";
  return "webm";
}

export function canCaptureScreen() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

export async function getDisplay({ mode, fps, systemAudio }) {
  const surface = SURFACES[mode];
  return navigator.mediaDevices.getDisplayMedia({
    video: { ...(surface ? { displaySurface: surface } : {}), frameRate: { ideal: fps, max: fps } },
    audio: systemAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false } : false,
    systemAudio: systemAudio ? "include" : "exclude",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    monitorTypeSurfaces: "include",
    preferCurrentTab: false,
  });
}

export function getCamera({ deviceId, fps = 30 }) {
  return navigator.mediaDevices.getUserMedia({
    video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: fps } },
    audio: false,
  });
}

export function getMic({ deviceId, noiseSuppression = true }) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      noiseSuppression,
      echoCancellation: noiseSuppression,
      autoGainControl: true,
      channelCount: { ideal: 2 },
    },
    video: false,
  });
}

export async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const pick = (kind) =>
      devices.filter((device) => device.kind === kind && device.deviceId).map((device, index) => ({ id: device.deviceId, label: device.label || `${kind === "audioinput" ? "Microphone" : "Camera"} ${index + 1}` }));
    return { mics: pick("audioinput"), cameras: pick("videoinput") };
  } catch {
    return { mics: [], cameras: [] };
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** A timer that keeps firing while the tab is in the background (main-thread timers get slowed to once a second or worse). */
export class Ticker {
  constructor(ms, onTick) {
    const code = "let t;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
    this.url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    this.worker = new Worker(this.url);
    this.worker.onmessage = onTick;
    this.worker.postMessage(ms);
  }
  stop() {
    this.worker.terminate();
    URL.revokeObjectURL(this.url);
  }
}

/** Keeps the newest frame of a video track ready to draw, even when the page is hidden. */
export class FrameSource {
  constructor(track) {
    this.track = track;
    this.latest = null;
    this.closed = false;
    if (typeof window.MediaStreamTrackProcessor === "function") {
      const processor = new window.MediaStreamTrackProcessor({ track });
      this.reader = processor.readable.getReader();
      this.ready = new Promise((resolve) => (this.resolveReady = resolve));
      this.pump();
    } else {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([track]);
      this.video = video;
      this.ready = new Promise((resolve) => {
        video.onloadeddata = () => resolve();
        video.play().catch(() => {});
      });
    }
  }

  async pump() {
    while (!this.closed) {
      let result;
      try {
        result = await this.reader.read();
      } catch {
        break;
      }
      if (result.done) break;
      if (this.closed) {
        result.value.close();
        break;
      }
      this.latest?.close();
      this.latest = result.value;
      this.resolveReady?.();
      this.resolveReady = null;
    }
  }

  get image() {
    return this.video ?? this.latest;
  }
  get width() {
    return this.video ? this.video.videoWidth : (this.latest?.displayWidth ?? 0);
  }
  get height() {
    return this.video ? this.video.videoHeight : (this.latest?.displayHeight ?? 0);
  }

  close() {
    this.closed = true;
    this.reader?.cancel().catch(() => {});
    this.latest?.close();
    this.latest = null;
    if (this.video) this.video.srcObject = null;
  }
}

/** Mixes any number of sound sources into one track, with a gain and a level meter for each. */
export class AudioMixer {
  constructor() {
    this.ctx = new AudioContext();
    this.ctx.resume().catch(() => {});
    this.dest = this.ctx.createMediaStreamDestination();
    this.inputs = new Map();
  }

  add(id, stream, gain = 1) {
    if (!stream?.getAudioTracks().length) return;
    const source = this.ctx.createMediaStreamSource(stream);
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = gain;
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(gainNode);
    gainNode.connect(analyser);
    gainNode.connect(this.dest);
    this.inputs.set(id, { source, gainNode, analyser, buffer: new Float32Array(analyser.fftSize) });
  }

  has(id) {
    return this.inputs.has(id);
  }

  setGain(id, value) {
    const input = this.inputs.get(id);
    if (input) input.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** 0–1 level on a -60…0 dB scale. */
  level(id) {
    const input = this.inputs.get(id);
    if (!input) return 0;
    input.analyser.getFloatTimeDomainData(input.buffer);
    let peak = 0;
    for (const sample of input.buffer) peak = Math.max(peak, Math.abs(sample));
    const db = 20 * Math.log10(peak || 1e-6);
    return Math.max(0, Math.min(1, (db + 60) / 60));
  }

  get track() {
    return this.inputs.size ? this.dest.stream.getAudioTracks()[0] : null;
  }

  close() {
    this.ctx.close().catch(() => {});
  }
}

const CAM_SIZES = { s: 0.16, m: 0.22, l: 0.3 };
const MARK_SIZES = { s: 0.028, m: 0.04, l: 0.056 };
const even = (value) => Math.max(2, Math.round(value / 2) * 2);

/** Draws the captured screen (optionally cropped), a webcam bubble and a watermark onto one canvas and streams it. */
export class Compositor {
  constructor({ main, camera, fps, maxHeight, crop, cam, mark }) {
    this.main = new FrameSource(main);
    this.camera = camera ? new FrameSource(camera) : null;
    this.fps = fps;
    this.maxHeight = maxHeight;
    this.crop = crop;
    this.cam = cam;
    this.mark = mark;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
  }

  async start() {
    await Promise.race([this.main.ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
    const crop = this.cropPixels();
    let width = crop.w;
    let height = crop.h;
    if (this.maxHeight && height > this.maxHeight) {
      width = (width * this.maxHeight) / height;
      height = this.maxHeight;
    }
    this.canvas.width = even(width || 1280);
    this.canvas.height = even(height || 720);
    this.draw();
    this.stream = this.canvas.captureStream(this.fps);
    this.ticker = new Ticker(1000 / this.fps, () => this.draw());
    return this.stream.getVideoTracks()[0];
  }

  update(options) {
    Object.assign(this, options);
  }

  cropPixels() {
    const sw = this.main.width;
    const sh = this.main.height;
    const crop = this.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    return { x: crop.x * sw, y: crop.y * sh, w: Math.max(2, crop.w * sw), h: Math.max(2, crop.h * sh) };
  }

  draw() {
    const { ctx, canvas } = this;
    const frame = this.main.image;
    if (!frame || !this.main.width) return;
    const W = canvas.width;
    const H = canvas.height;
    const crop = this.cropPixels();
    const scale = Math.min(W / crop.w, H / crop.h);
    const dw = crop.w * scale;
    const dh = crop.h * scale;
    ctx.fillStyle = "#000";
    if (Math.abs(dw - W) > 1 || Math.abs(dh - H) > 1) ctx.fillRect(0, 0, W, H);
    try {
      ctx.drawImage(frame, crop.x, crop.y, crop.w, crop.h, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      return;
    }
    if (this.camera?.image && this.camera.width && this.cam) this.drawCamera(W, H);
    if (this.mark && this.mark.kind !== "off") this.drawMark(W, H);
  }

  drawCamera(W, H) {
    const { ctx, cam } = this;
    const cw = this.camera.width;
    const ch = this.camera.height;
    const circle = cam.shape === "circle";
    const boxW = W * (CAM_SIZES[cam.size] ?? CAM_SIZES.m);
    const boxH = circle ? boxW : boxW * (ch / cw);
    const margin = Math.round(Math.min(W, H) * 0.03);
    const x = cam.position.endsWith("left") ? margin : W - boxW - margin;
    const y = cam.position.startsWith("top") ? margin : H - boxH - margin;
    // Crop the camera to the box aspect from its centre.
    const boxAspect = boxW / boxH;
    let sw = cw;
    let sh = ch;
    if (cw / ch > boxAspect) sw = ch * boxAspect;
    else sh = cw / boxAspect;
    ctx.save();
    ctx.beginPath();
    if (circle) ctx.arc(x + boxW / 2, y + boxH / 2, boxW / 2, 0, Math.PI * 2);
    else ctx.roundRect(x, y, boxW, boxH, boxW * 0.06);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = margin * 0.6;
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (cam.mirror) {
      ctx.translate(x + boxW, y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.camera.image, (cw - sw) / 2, (ch - sh) / 2, sw, sh, 0, 0, boxW, boxH);
    } else {
      ctx.drawImage(this.camera.image, (cw - sw) / 2, (ch - sh) / 2, sw, sh, x, y, boxW, boxH);
    }
    ctx.restore();
  }

  drawMark(W, H) {
    const { ctx, mark } = this;
    const margin = Math.round(Math.min(W, H) * 0.03);
    ctx.save();
    ctx.globalAlpha = mark.opacity ?? 0.8;
    let boxW;
    let boxH;
    if (mark.kind === "image" && mark.bitmap) {
      boxW = W * (MARK_SIZES[mark.size] ?? MARK_SIZES.m) * 3.2;
      boxH = boxW * (mark.bitmap.height / mark.bitmap.width);
    } else if (mark.kind === "text" && mark.text) {
      const px = Math.round(H * (MARK_SIZES[mark.size] ?? MARK_SIZES.m));
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      boxW = ctx.measureText(mark.text).width;
      boxH = px;
    } else {
      ctx.restore();
      return;
    }
    const x = mark.position.endsWith("left") ? margin : W - boxW - margin;
    const y = mark.position.startsWith("top") ? margin : H - boxH - margin;
    if (mark.kind === "image") {
      ctx.drawImage(mark.bitmap, x, y, boxW, boxH);
    } else {
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = boxH * 0.25;
      ctx.fillStyle = "#fff";
      ctx.fillText(mark.text, x, y);
    }
    ctx.restore();
  }

  stop() {
    this.ticker?.stop();
    this.main.close();
    this.camera?.close();
    stopStream(this.stream);
  }
}

/** Draws the current frame of a drawable into a canvas. */
export function frameCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas;
}

export function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the image"))), type, quality));
}

/** Bits per second for a size, frame rate and quality preset. */
export function bitrateFor(width, height, fps, quality) {
  const bpp = { standard: 0.06, high: 0.1, max: 0.16 }[quality] ?? 0.1;
  return Math.round(Math.min(40e6, Math.max(1.2e6, width * height * fps * bpp)));
}

// ---- WebM duration ----
// Chrome writes WebM without a duration, so players can't seek it. This adds the Duration element to the header.

function vint(bytes, at) {
  const first = bytes[at];
  if (!first) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > 8 || at + length > bytes.length) return null;
  let value = first & (0xff >> length);
  let unknown = value === 0xff >> length;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[at + i];
    if (bytes[at + i] !== 0xff) unknown = false;
  }
  return { length, value, unknown };
}

function readId(bytes, at) {
  const size = vint(bytes, at);
  if (!size) return null;
  let id = 0;
  for (let i = 0; i < size.length; i += 1) id = id * 256 + bytes[at + i];
  return { id, length: size.length };
}

export async function fixWebmDuration(blob, durationMs) {
  if (!durationMs || !blob.type.includes("webm")) return blob;
  try {
    const headLength = Math.min(blob.size, 1 << 17);
    const head = new Uint8Array(await blob.slice(0, headLength).arrayBuffer());
    let info = -1;
    for (let i = 0; i < head.length - 4; i += 1) {
      if (head[i] === 0x15 && head[i + 1] === 0x49 && head[i + 2] === 0xa9 && head[i + 3] === 0x66) {
        info = i;
        break;
      }
    }
    if (info < 0) return blob;
    const size = vint(head, info + 4);
    if (!size || size.unknown) return blob;
    const bodyStart = info + 4 + size.length;
    const bodyEnd = bodyStart + size.value;
    if (bodyEnd > head.length) return blob;

    let scale = 1e6;
    for (let at = bodyStart; at < bodyEnd; ) {
      const id = readId(head, at);
      if (!id) return blob;
      const childSize = vint(head, at + id.length);
      if (!childSize) return blob;
      const dataAt = at + id.length + childSize.length;
      if (id.id === 0x4489) return blob; // Already has a duration.
      if (id.id === 0x2ad7b1) {
        scale = 0;
        for (let i = 0; i < childSize.value; i += 1) scale = scale * 256 + head[dataAt + i];
      }
      at = dataAt + childSize.value;
    }

    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(3, (durationMs * 1e6) / (scale || 1e6));
    const newSize = size.value + duration.length;
    const sizeBytes = new Uint8Array(8);
    sizeBytes[0] = 0x01;
    let rest = newSize;
    for (let i = 7; i >= 1; i -= 1) {
      sizeBytes[i] = rest & 0xff;
      rest = Math.floor(rest / 256);
    }
    return new Blob(
      [head.slice(0, info + 4), sizeBytes, head.slice(bodyStart, bodyEnd), duration, head.slice(bodyEnd), blob.slice(headLength)],
      { type: blob.type },
    );
  } catch {
    return blob;
  }
}
