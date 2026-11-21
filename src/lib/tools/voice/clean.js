/**
 * Voice cleanup that runs entirely in the browser.
 * Order: rumble + hum filters → RNNoise (AI noise removal) → spectral noise reduction → gate between words → trim → loudness.
 * Everything works on mono Float32 samples at 48 kHz, the rate RNNoise is trained on.
 */

export const SAMPLE_RATE = 48000;
const BLOCK = 480; // 10 ms
/** RNNoise returns audio 20 ms late (measured by cross-correlating its output with clean speech). */
export const RNNOISE_DELAY = 960;

export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "Cancelled";
  }
}

const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Calls back to let the page paint (and checks for cancel) about every 30 ms of work. */
function pacer(isCancelled) {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 30) return;
    await breathe();
    last = performance.now();
    if (isCancelled?.()) throw new Cancelled();
  };
}

// ---------- decoding ----------

/** Decodes any audio (or video with sound) the browser can play into mono 48 kHz samples. */
export async function decodeToMono(blob) {
  const data = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(data);
  } finally {
    ctx.close().catch(() => {});
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

// ---------- filters ----------

/** RBJ cookbook biquad coefficients. */
export function biquad(type, freq, q, gainDb = 0, rate = SAMPLE_RATE) {
  const w = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === "notch") {
    b0 = 1;
    b1 = -2 * cos;
    b2 = 1;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === "peak") {
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else if (type === "highshelf") {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cos + s);
    b1 = -2 * A * (A - 1 + (A + 1) * cos);
    b2 = A * (A + 1 + (A - 1) * cos - s);
    a0 = A + 1 - (A - 1) * cos + s;
    a1 = 2 * (A - 1 - (A + 1) * cos);
    a2 = A + 1 - (A - 1) * cos - s;
  } else {
    throw new Error(`Unknown filter ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Runs a biquad over the samples in place (transposed direct form II). */
export function filter(x, c) {
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const input = x[i];
    const out = c.b0 * input + z1;
    z1 = c.b1 * input - c.a1 * out + z2;
    z2 = c.b2 * input - c.a2 * out;
    x[i] = out;
  }
  return x;
}

/** Power of one frequency across a stretch of samples (Goertzel). */
function goertzel(x, start, length, freq) {
  const k = (2 * Math.PI * freq) / SAMPLE_RATE;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = start; i < start + length; i += 1) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/** Finds mains hum: 50 or 60 (Hz), or null when there isn't any. */
export function detectHum(x) {
  const seconds = Math.min(30, Math.floor(x.length / SAMPLE_RATE));
  if (seconds < 1) return null;
  const score = (base) => {
    const ratios = [];
    for (let harmonic = 1; harmonic <= 3; harmonic += 1) {
      const f = base * harmonic;
      let peak = 0;
      let around = 0;
      for (let s = 0; s < seconds; s += 1) {
        const start = s * SAMPLE_RATE;
        peak += goertzel(x, start, SAMPLE_RATE, f);
        around += (goertzel(x, start, SAMPLE_RATE, f - 6) + goertzel(x, start, SAMPLE_RATE, f + 6)) / 2;
      }
      ratios.push(Math.log10((peak + 1e-9) / (around + 1e-9)));
    }
    // Hum either shows across its harmonics, or as one very strong line.
    return Math.max(ratios.reduce((a, b) => a + b) / 3, Math.max(...ratios) - 0.3);
  };
  const fifty = score(50);
  const sixty = score(60);
  const best = fifty > sixty ? 50 : 60;
  // ~8 dB above the neighbouring frequencies on average, or ~11 dB on one harmonic.
  return Math.max(fifty, sixty) > 0.8 ? best : null;
}

export function removeHum(x, base) {
  // Hum lives in the fundamental and its first few harmonics; narrow notches leave the voice between them alone.
  for (let harmonic = 1; harmonic * base <= 400; harmonic += 1) {
    filter(x, biquad("notch", base * harmonic, harmonic === 1 ? 16 : 40));
  }
  return x;
}

export function removeRumble(x) {
  const c = biquad("highpass", 75, 0.707);
  filter(x, c);
  return filter(x, c);
}

export function clarity(x) {
  filter(x, biquad("peak", 250, 1, -2));
  filter(x, biquad("peak", 3200, 0.9, 3));
  return filter(x, biquad("highshelf", 9000, 0.7, 1.5));
}

// ---------- RNNoise ----------

let rnnoiseLoading = null;
function loadRnnoise() {
  rnnoiseLoading ??= import("@shiguredo/rnnoise-wasm").then((module) => module.Rnnoise.load()).catch((error) => {
    rnnoiseLoading = null;
    throw error;
  });
  return rnnoiseLoading;
}

/** AI noise removal. Returns the cleaned samples and a 0–1 voice probability for every 10 ms. */
export async function rnnoise(x, { onProgress, isCancelled } = {}) {
  const rn = await loadRnnoise();
  const state = rn.createDenoiseState();
  const size = rn.frameSize;
  const out = new Float32Array(x.length);
  const frames = Math.ceil((x.length + RNNOISE_DELAY) / size);
  const vad = new Float32Array(frames);
  const frame = new Float32Array(size);
  const pace = pacer(isCancelled);
  try {
    // Warm the model up on the opening 300 ms so it doesn't start cold (it flags the first frames as voice and lets noise through).
    const warm = Math.min(30, Math.floor(x.length / size));
    for (let f = 0; f < warm; f += 1) {
      for (let i = 0; i < size; i += 1) frame[i] = x[f * size + i] * 32768;
      state.processFrame(frame);
    }
    for (let f = 0; f < frames; f += 1) {
      const start = f * size;
      for (let i = 0; i < size; i += 1) frame[i] = (x[start + i] ?? 0) * 32768;
      vad[f] = state.processFrame(frame);
      const at = start - RNNOISE_DELAY;
      for (let i = 0; i < size; i += 1) {
        const j = at + i;
        if (j >= 0 && j < out.length) out[j] = frame[i] / 32768;
      }
      if (f % 200 === 0) {
        onProgress?.(f / frames);
        await pace();
      }
    }
  } finally {
    state.destroy();
  }
  // A voice flag per 10 ms. Being off by one block doesn't matter: the gate holds open for ~220 ms anyway.
  return { samples: out, vad };
}

// ---------- FFT + spectral noise reduction ----------

function makeFft(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) {
    let r = 0;
    for (let b = 0; b < levels; b += 1) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i += 1) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  /** In place; inverse when `inverse` is true (unscaled). */
  return (re, im, inverse = false) => {
    for (let i = 0; i < n; i += 1) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k += 1) {
          const wr = cos[k * step];
          const wi = inverse ? sin[k * step] : -sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}

export const FFT_SIZE = 1024;
const HOP = FFT_SIZE / 4;

/**
 * Stationary noise reduction (hiss, fans, hum leftovers).
 * Learns the noise from the quietest moments, then turns down each frequency by how much of it is noise.
 */
export async function spectralDenoise(x, { amount = 0.5, onProgress, isCancelled } = {}) {
  if (amount <= 0) return x;
  const n = FFT_SIZE;
  const bins = n / 2 + 1;
  const fft = makeFft(n);
  const win = new Float32Array(n);
  for (let i = 0; i < n; i += 1) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const pace = pacer(isCancelled);
  const frames = Math.ceil((x.length + n) / HOP);

  const load = (f) => {
    const start = f * HOP - n;
    for (let i = 0; i < n; i += 1) {
      const j = start + i;
      re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0;
      im[i] = 0;
    }
  };

  // 1. Noise profile: the average spectrum of the quietest 15% of frames that have any sound at all.
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const start = f * HOP - n;
    let sum = 0;
    for (let i = Math.max(0, start); i < Math.min(x.length, start + n); i += 1) sum += x[i] * x[i];
    energy[f] = sum;
  }
  const order = Array.from(energy.keys())
    .filter((f) => energy[f] > 1e-12)
    .sort((a, b) => energy[a] - energy[b]);
  if (!order.length) return x; // Digital silence: nothing to learn or remove.
  const pick = order.slice(0, Math.max(1, Math.min(600, Math.floor(order.length * 0.15))));
  const noise = new Float64Array(bins);
  for (const f of pick) {
    load(f);
    fft(re, im);
    for (let k = 0; k < bins; k += 1) noise[k] += re[k] * re[k] + im[k] * im[k];
  }
  for (let k = 0; k < bins; k += 1) noise[k] = noise[k] / pick.length + 1e-20;
  // Smooth the profile across frequency so one odd bin doesn't punch a hole.
  const profile = new Float64Array(bins);
  for (let k = 0; k < bins; k += 1) {
    let sum = 0;
    let count = 0;
    for (let d = -2; d <= 2; d += 1) {
      if (k + d >= 0 && k + d < bins) {
        sum += noise[k + d];
        count += 1;
      }
    }
    profile[k] = sum / count;
  }

  // 2. Filter every frame with a smoothed Wiener-style gain and overlap-add it back together.
  const floor = 10 ** (-(6 + amount * 24) / 20);
  const over = 1 + amount * 2;
  const out = new Float32Array(x.length);
  const prev = new Float64Array(bins).fill(1);
  const gain = new Float64Array(bins);
  for (let f = 0; f < frames; f += 1) {
    load(f);
    fft(re, im);
    for (let k = 0; k < bins; k += 1) {
      const power = re[k] * re[k] + im[k] * im[k];
      const g = Math.max(floor, 1 - (over * profile[k]) / (power + 1e-20));
      // Fast to open, slower to close: less "musical noise" chirping.
      gain[k] = g > prev[k] ? g : 0.55 * prev[k] + 0.45 * g;
    }
    for (let k = 0; k < bins; k += 1) {
      const smooth = k > 0 && k < bins - 1 ? 0.25 * gain[k - 1] + 0.5 * gain[k] + 0.25 * gain[k + 1] : gain[k];
      prev[k] = gain[k];
      re[k] *= smooth;
      im[k] *= smooth;
      if (k > 0 && k < n / 2) {
        re[n - k] = re[k];
        im[n - k] = -im[k];
      }
    }
    fft(re, im, true);
    const start = f * HOP - n;
    // sqrt-Hann in and out at 75% overlap sums to 2.
    for (let i = 0; i < n; i += 1) {
      const j = start + i;
      if (j >= 0 && j < out.length) out[j] += (re[i] / n) * win[i] * 0.5;
    }
    if (f % 256 === 0) {
      onProgress?.(f / frames);
      await pace();
    }
  }
  return out;
}

// ---------- levels, gate, trim, loudness ----------

const toDb = (power) => 10 * Math.log10(power + 1e-12);

/** Loudness of every 10 ms block, in dBFS. */
export function blockLevels(x) {
  const count = Math.ceil(x.length / BLOCK);
  const levels = new Float32Array(count);
  for (let b = 0; b < count; b += 1) {
    let sum = 0;
    const end = Math.min(x.length, (b + 1) * BLOCK);
    for (let i = b * BLOCK; i < end; i += 1) sum += x[i] * x[i];
    levels[b] = toDb(sum / Math.max(1, end - b * BLOCK));
  }
  return levels;
}

function percentile(values, p) {
  if (!values.length) return -120;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Background noise level (quiet moments) and speech level (loud moments), in dBFS. */
export function measure(x) {
  // Clamp rather than drop digital silence, or a perfectly cleaned gap would make quiet speech count as "noise".
  const levels = blockLevels(x).map((level) => Math.max(level, -100));
  return { noise: percentile(levels, 0.1), speech: percentile(levels, 0.9) };
}

/** Which 10 ms blocks hold speech: the AI voice flags if we have them, otherwise loudness. */
export function speechMask(x, vad) {
  const levels = blockLevels(x);
  const noise = percentile(levels.filter((level) => level > -110), 0.1);
  const loud = percentile(levels, 0.95);
  const threshold = Math.max(noise + 9, loud - 40);
  const mask = new Uint8Array(levels.length);
  for (let b = 0; b < levels.length; b += 1) {
    const voice = vad ? (vad[b] ?? 0) > 0.55 : false;
    mask[b] = voice || levels[b] > (vad ? Math.max(threshold, noise + 15) : threshold) ? 1 : 0;
  }
  // Keep a little before each word and hold open briefly after, so syllables aren't clipped.
  const before = 3;
  const hold = 22;
  const out = new Uint8Array(mask.length);
  let last = -Infinity;
  for (let b = 0; b < mask.length; b += 1) {
    if (mask[b]) last = b;
    if (b - last <= hold) out[b] = 1;
  }
  for (let b = 0; b < mask.length; b += 1) {
    if (mask[b]) for (let d = 1; d <= before && b - d >= 0; d += 1) out[b - d] = 1;
  }
  return out;
}

/** Turns down the gaps between words by `depthDb`, with soft ramps. */
export function gate(x, mask, depthDb) {
  if (depthDb <= 0) return x;
  const closed = 10 ** (-depthDb / 20);
  const attack = 1 - Math.exp(-1 / (0.004 * SAMPLE_RATE));
  const release = 1 - Math.exp(-1 / (0.08 * SAMPLE_RATE));
  let g = mask[0] ? 1 : closed;
  for (let i = 0; i < x.length; i += 1) {
    const target = mask[Math.floor(i / BLOCK)] ? 1 : closed;
    g += (target - g) * (target > g ? attack : release);
    x[i] *= g;
  }
  return x;
}

/** Cuts silence off both ends, keeping a short pad. Returns [start, end] sample positions. */
export function trimRange(length, mask, padSeconds = 0.25) {
  const first = mask.indexOf(1);
  if (first < 0) return [0, length];
  const last = mask.lastIndexOf(1);
  const pad = Math.round(padSeconds * SAMPLE_RATE);
  return [Math.max(0, first * BLOCK - pad), Math.min(length, (last + 1) * BLOCK + pad)];
}

/** Brings speech up (or down) to `targetDb` RMS and keeps peaks under `ceilingDb` with a look-ahead limiter. */
export function normalize(x, mask, targetDb = -19, ceilingDb = -1) {
  let sum = 0;
  let count = 0;
  for (let b = 0; b < mask.length; b += 1) {
    if (!mask[b]) continue;
    const end = Math.min(x.length, (b + 1) * BLOCK);
    for (let i = b * BLOCK; i < end; i += 1) sum += x[i] * x[i];
    count += end - b * BLOCK;
  }
  if (!count) {
    for (let i = 0; i < x.length; i += 1) sum += x[i] * x[i];
    count = x.length;
  }
  const rms = toDb(sum / Math.max(1, count));
  const gainDb = Math.max(-20, Math.min(30, targetDb - rms));
  const gain = 10 ** (gainDb / 20);
  for (let i = 0; i < x.length; i += 1) x[i] *= gain;
  return limit(x, 10 ** (ceilingDb / 20));
}

export function limit(x, ceiling) {
  const size = 64;
  const blocks = Math.ceil(x.length / size);
  const need = new Float32Array(blocks + 2).fill(1);
  for (let b = 0; b < blocks; b += 1) {
    let peak = 0;
    const end = Math.min(x.length, (b + 1) * size);
    for (let i = b * size; i < end; i += 1) peak = Math.max(peak, Math.abs(x[i]));
    need[b] = peak > ceiling ? ceiling / peak : 1;
  }
  const release = 1 - Math.exp(-1 / (0.12 * SAMPLE_RATE));
  let g = 1;
  for (let i = 0; i < x.length; i += 1) {
    const b = Math.floor(i / size);
    const target = Math.min(need[b], need[b + 1], need[b + 2]);
    // Duck ahead of a peak over ~1.3 ms, recover slowly.
    g = target < g ? g + (target - g) * 0.05 : g + (target - g) * release;
    let v = x[i] * Math.min(g, need[b]);
    if (v > ceiling) v = ceiling;
    else if (v < -ceiling) v = -ceiling;
    x[i] = v;
  }
  return x;
}

// ---------- the whole chain ----------

export const PRESETS = {
  light: { ai: true, aiMix: 0.75, reduce: 0.3, hum: "auto", rumble: true, gate: 0.2, clarity: false, loudness: true, trim: false },
  balanced: { ai: true, aiMix: 1, reduce: 0.5, hum: "auto", rumble: true, gate: 0.45, clarity: true, loudness: true, trim: true },
  strong: { ai: true, aiMix: 1, reduce: 0.85, hum: "auto", rumble: true, gate: 0.75, clarity: true, loudness: true, trim: true },
};

/** Keeps the slow steps (filters + AI pass) cached so changing later settings re-runs quickly. */
export class Cleaner {
  constructor(source) {
    this.source = source;
    this.before = measure(source);
    this.cache = {};
  }

  async run(options, { onProgress, isCancelled } = {}) {
    const step = (from, to) => (value) => onProgress?.(from + (to - from) * value);
    const pace = pacer(isCancelled);

    const preKey = `${options.hum}|${options.rumble}`;
    if (this.cache.pre?.key !== preKey) {
      const x = new Float32Array(this.source);
      const hum = options.hum === "auto" ? detectHum(x) : options.hum === "off" ? null : Number(options.hum);
      await pace();
      if (options.rumble) removeRumble(x);
      if (hum) removeHum(x, hum);
      this.cache = { pre: { key: preKey, x, hum } };
    }
    onProgress?.(0.06);
    const pre = this.cache.pre;

    let ai = null;
    if (options.ai) {
      const aiKey = preKey;
      if (this.cache.ai?.key !== aiKey) {
        const result = await rnnoise(pre.x, { onProgress: step(0.06, 0.5), isCancelled });
        this.cache.ai = { key: aiKey, ...result };
        this.cache.spectral = null;
      }
      ai = this.cache.ai;
    }

    const mix = options.ai ? options.aiMix : 0;
    const specKey = `${preKey}|${options.ai}|${mix}|${options.reduce}`;
    if (this.cache.spectral?.key !== specKey) {
      let x;
      if (ai && mix >= 1) x = ai.samples;
      else if (ai) {
        x = new Float32Array(pre.x.length);
        for (let i = 0; i < x.length; i += 1) x[i] = ai.samples[i] * mix + pre.x[i] * (1 - mix);
      } else x = pre.x;
      const samples = await spectralDenoise(x, { amount: options.reduce, onProgress: step(0.5, 0.9), isCancelled });
      this.cache.spectral = { key: specKey, samples: samples === x ? new Float32Array(x) : samples };
    }
    onProgress?.(0.92);
    await pace();

    let out = new Float32Array(this.cache.spectral.samples);
    if (options.clarity) clarity(out);
    let mask = speechMask(out, ai?.vad);
    gate(out, mask, options.gate * 40);
    let trimmed = 0;
    let offset = 0;
    if (options.trim) {
      const [start, end] = trimRange(out.length, mask);
      if (start > 0 || end < out.length) {
        trimmed = (out.length - (end - start)) / SAMPLE_RATE;
        offset = start / SAMPLE_RATE;
        out = out.slice(start, end);
        mask = mask.slice(Math.floor(start / BLOCK), Math.ceil(end / BLOCK));
      }
    }
    if (options.loudness) normalize(out, mask);
    else limit(out, 10 ** (-0.3 / 20));
    onProgress?.(1);
    return { samples: out, hum: pre.hum, trimmed, offset, before: this.before, after: measure(out) };
  }
}

// ---------- files ----------

export function encodeWav(samples, rate = SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function encodeMp3(samples, { rate = SAMPLE_RATE, kbps = 192, onProgress, isCancelled } = {}) {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, rate, kbps);
  const chunk = 1152 * 20;
  const pcm = new Int16Array(chunk);
  const parts = [];
  const pace = pacer(isCancelled);
  for (let start = 0; start < samples.length; start += chunk) {
    const length = Math.min(chunk, samples.length - start);
    for (let i = 0; i < length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[start + i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const data = encoder.encodeBuffer(length === chunk ? pcm : pcm.subarray(0, length));
    if (data.length) parts.push(new Uint8Array(data));
    onProgress?.(start / samples.length);
    await pace();
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: "audio/mpeg" });
}

/** Min/max pairs for drawing a waveform `columns` wide. */
export function peaks(samples, columns) {
  const out = new Float32Array(columns * 2);
  const per = samples.length / columns;
  for (let c = 0; c < columns; c += 1) {
    let min = 0;
    let max = 0;
    const start = Math.floor(c * per);
    const end = Math.min(samples.length, Math.floor((c + 1) * per));
    const stride = Math.max(1, Math.floor((end - start) / 400));
    for (let i = start; i < end; i += stride) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[c * 2] = min;
    out[c * 2 + 1] = max;
  }
  return out;
}
