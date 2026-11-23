/**
 * Screenshot editing: the shape model, drawing it over the captured image, the backdrop around it, and the
 * pixel helpers behind smart erase, the colour picker and the ruler.
 *
 * Everything is in image pixels of the original capture. A crop only changes what is shown and exported,
 * so shapes keep their place when the crop is changed or undone.
 */

export const COLORS = ["#e5483b", "#f08c2e", "#f5c542", "#3fa45b", "#2f7de1", "#8b5cf6", "#ec4899", "#1e1b16", "#ffffff"];
const WIDTHS = { s: 2, m: 4, l: 8 };
const TEXT_SIZES = { s: 16, m: 24, l: 38 };
const BOX_TYPES = new Set(["rect", "oval", "highlight", "blur", "erase", "spotlight"]);
const LINE_TYPES = new Set(["arrow", "line"]);

/** Line widths and text grow with the image, so a 4K capture doesn't get hairlines. */
export function unitFor(width, height) {
  return Math.max(1, Math.max(width, height) / 1400);
}
export const strokeWidth = (size, unit) => (WIDTHS[size] ?? WIDTHS.m) * unit;
export const textSize = (size, unit) => (TEXT_SIZES[size] ?? TEXT_SIZES.m) * unit;

export const isBox = (shape) => BOX_TYPES.has(shape.type);
export const isLine = (shape) => LINE_TYPES.has(shape.type);

/** A box with positive width and height. */
export function norm({ x, y, w, h }) {
  return { x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, w: Math.abs(w), h: Math.abs(h) };
}

const FONT = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

function contrast(hex = "#000000") {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum > 160 ? "#1e1b16" : "#ffffff";
}

let measureCtx = null;
function measure() {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  return measureCtx;
}

/** Width and height a text shape takes up. */
export function textBox(shape) {
  const ctx = measure();
  ctx.font = FONT(shape.size);
  const lines = String(shape.text || " ").split("\n");
  const width = Math.max(...lines.map((line) => ctx.measureText(line || " ").width));
  const lineH = shape.size * 1.25;
  const pad = shape.bg ? shape.size * 0.35 : 0;
  return { x: shape.x - pad, y: shape.y - pad, w: width + pad * 2, h: lines.length * lineH + pad * 2 };
}

/** The area a shape covers, for selecting and moving. */
export function boundsOf(shape) {
  if (isBox(shape)) return norm(shape);
  if (isLine(shape)) return norm({ x: shape.x1, y: shape.y1, w: shape.x2 - shape.x1, h: shape.y2 - shape.y1 });
  if (shape.type === "pen") {
    const xs = shape.points.map((p) => p[0]);
    const ys = shape.points.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (shape.type === "text") return textBox(shape);
  if (shape.type === "step") return { x: shape.x - shape.r, y: shape.y - shape.r, w: shape.r * 2, h: shape.r * 2 };
  return { x: 0, y: 0, w: 0, h: 0 };
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Whether a point (image px) is on a shape; `slack` is how far off still counts. */
export function hits(shape, x, y, slack) {
  if (isLine(shape)) return segmentDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= shape.width / 2 + slack;
  if (shape.type === "pen") {
    for (let i = 1; i < shape.points.length; i += 1) {
      const [x1, y1] = shape.points[i - 1];
      const [x2, y2] = shape.points[i];
      if (segmentDistance(x, y, x1, y1, x2, y2) <= shape.width / 2 + slack) return true;
    }
    return false;
  }
  if (shape.type === "step") return Math.hypot(x - shape.x, y - shape.y) <= shape.r + slack;
  const b = boundsOf(shape);
  const inside = x >= b.x - slack && x <= b.x + b.w + slack && y >= b.y - slack && y <= b.y + b.h + slack;
  if (!inside) return false;
  // Outlined rectangles and ovals are picked by their edge, so whatever is inside them stays clickable.
  if ((shape.type === "rect" && !shape.fill) || shape.type === "oval") {
    const edge = shape.width / 2 + slack;
    return x <= b.x + edge || x >= b.x + b.w - edge || y <= b.y + edge || y >= b.y + b.h - edge || shape.type === "oval";
  }
  return true;
}

/** Moves a shape by dx, dy. */
export function moved(shape, dx, dy) {
  if (isLine(shape)) return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  if (shape.type === "pen") return { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

function drawArrow(ctx, s) {
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const head = Math.min(length * 0.6, s.width * 3.2 + 8);
  const spread = Math.PI / 7;
  // The shaft tapers from thin at the tail to full width at the head, which reads cleaner than a plain line.
  const back = { x: s.x2 - Math.cos(angle) * head * 0.8, y: s.y2 - Math.sin(angle) * head * 0.8 };
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const tail = s.width * 0.25;
  const neck = s.width * 0.6;
  ctx.beginPath();
  ctx.moveTo(s.x1 + nx * tail, s.y1 + ny * tail);
  ctx.lineTo(back.x + nx * neck, back.y + ny * neck);
  ctx.lineTo(s.x2 - Math.cos(angle - spread) * head, s.y2 - Math.sin(angle - spread) * head);
  ctx.lineTo(s.x2, s.y2);
  ctx.lineTo(s.x2 - Math.cos(angle + spread) * head, s.y2 - Math.sin(angle + spread) * head);
  ctx.lineTo(back.x - nx * neck, back.y - ny * neck);
  ctx.lineTo(s.x1 - nx * tail, s.y1 - ny * tail);
  ctx.closePath();
  ctx.fillStyle = s.color;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, s.width * 0.3);
  ctx.strokeStyle = s.color;
  ctx.fill();
  ctx.stroke();
}

const regionCache = new WeakMap();

/** Blur or pixelate a region of the original image (cached per shape, it's the slow part). */
function obscured(base, s, unit) {
  const b = norm(s);
  const key = `${b.x}|${b.y}|${b.w}|${b.h}|${s.style}`;
  let cache = regionCache.get(base);
  if (!cache) regionCache.set(base, (cache = new Map()));
  if (cache.has(key)) return cache.get(key);
  const w = Math.max(1, Math.round(b.w));
  const h = Math.max(1, Math.round(b.h));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (s.style === "blur") {
    const r = Math.max(6, 10 * unit);
    ctx.filter = `blur(${r}px)`;
    // Draw a margin around the region so the blur doesn't fade to transparent at the edges.
    ctx.drawImage(base, b.x - r * 2, b.y - r * 2, w + r * 4, h + r * 4, -r * 2, -r * 2, w + r * 4, h + r * 4);
  } else {
    const block = Math.max(6, Math.round(11 * unit));
    const sw = Math.max(1, Math.round(w / block));
    const sh = Math.max(1, Math.round(h / block));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    small.getContext("2d").drawImage(base, b.x, b.y, w, h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

/** Draws one shape. `base` is the original capture (for blur), `unit` the image's size unit. */
export function drawShape(ctx, s, base, unit) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (s.type) {
    case "arrow":
      drawArrow(ctx, s);
      break;
    case "line":
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      break;
    case "rect": {
      const b = norm(s);
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(s.width * 1.2, b.w / 2, b.h / 2));
      if (s.fill) {
        ctx.fillStyle = s.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
      break;
    }
    case "oval": {
      const b = norm(s);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      if (s.fill) {
        ctx.fillStyle = s.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
      break;
    }
    case "highlight": {
      const b = norm(s);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = s.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    }
    case "pen":
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.01, s.points[0][1]);
      ctx.stroke();
      break;
    case "text": {
      const lines = String(s.text || "").split("\n");
      const lineH = s.size * 1.25;
      ctx.font = FONT(s.size);
      ctx.textBaseline = "top";
      if (s.bg) {
        const b = textBox(s);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, s.size * 0.3);
        ctx.fill();
        ctx.fillStyle = contrast(s.color);
        lines.forEach((line, i) => ctx.fillText(line, s.x, s.y + i * lineH + s.size * 0.1));
      } else {
        // A thin contrasting outline keeps the text readable on any background.
        ctx.lineWidth = Math.max(2, s.size * 0.14);
        ctx.strokeStyle = contrast(s.color) === "#ffffff" ? "rgba(255,255,255,0.9)" : "rgba(20,16,12,0.85)";
        ctx.fillStyle = s.color;
        lines.forEach((line, i) => {
          ctx.strokeText(line, s.x, s.y + i * lineH + s.size * 0.1);
          ctx.fillText(line, s.x, s.y + i * lineH + s.size * 0.1);
        });
      }
      break;
    }
    case "step":
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = s.r * 0.4;
      ctx.shadowOffsetY = s.r * 0.08;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = Math.max(1.5, s.r * 0.12);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = contrast(s.color);
      ctx.font = FONT(Math.round(s.r * (s.n > 9 ? 0.95 : 1.15)), 700);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.n), s.x, s.y + s.r * 0.06);
      break;
    case "blur": {
      const b = norm(s);
      if (b.w >= 1 && b.h >= 1) ctx.drawImage(obscured(base, s, unit), b.x, b.y);
      break;
    }
    case "erase": {
      const b = norm(s);
      ctx.fillStyle = s.fill;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    }
    default:
  }
  ctx.restore();
}

/** Dims everything except the spotlight boxes. */
export function drawSpotlights(ctx, spots, width, height, unit) {
  if (!spots.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  for (const spot of spots) {
    const b = norm(spot);
    ctx.roundRect(b.x, b.y, b.w, b.h, 8 * unit);
  }
  ctx.fillStyle = "rgba(10,8,6,0.55)";
  ctx.fill("evenodd");
  ctx.restore();
}

/** Draws the capture and every shape onto ctx (already transformed to image px). */
export function drawScene(ctx, base, shapes, unit) {
  ctx.drawImage(base, 0, 0);
  for (const shape of shapes) if (shape.type !== "spotlight") drawShape(ctx, shape, base, unit);
  drawSpotlights(
    ctx,
    shapes.filter((shape) => shape.type === "spotlight"),
    base.width,
    base.height,
    unit,
  );
}

// ---- Pixels ----

const pixelCache = new WeakMap();

/** The capture's pixels, read once and kept for the picker, ruler and smart erase. */
export function pixelsOf(base) {
  let data = pixelCache.get(base);
  if (!data) {
    data = base.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, base.width, base.height);
    pixelCache.set(base, data);
  }
  return data;
}

export function colorAt(base, x, y) {
  const { data, width, height } = pixelsOf(base);
  const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const i = (py * width + px) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

export const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The colour around a box's edge (median of each channel), used to paint over what's inside. */
export function edgeColor(base, box) {
  const b = norm(box);
  const samples = [];
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    samples.push(colorAt(base, b.x + b.w * t, b.y - 2));
    samples.push(colorAt(base, b.x + b.w * t, b.y + b.h + 2));
    samples.push(colorAt(base, b.x - 2, b.y + b.h * t));
    samples.push(colorAt(base, b.x + b.w + 2, b.y + b.h * t));
  }
  const median = (channel) => {
    const values = samples.map((s) => s[channel]).sort((a, z) => a - z);
    return values[Math.floor(values.length / 2)];
  };
  return hex([median(0), median(1), median(2)]);
}

/**
 * From a point, how far it is to the nearest edge in each direction: the first pixel whose colour
 * differs noticeably from the starting one. Like holding a ruler against the screen.
 */
export function scanEdges(base, x, y, threshold = 36) {
  const { data, width, height } = pixelsOf(base);
  const sx = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const at = (px, py) => (py * width + px) * 4;
  const start = at(sx, sy);
  const differs = (i) => Math.abs(data[i] - data[start]) + Math.abs(data[i + 1] - data[start + 1]) + Math.abs(data[i + 2] - data[start + 2]) > threshold;
  let left = sx;
  while (left > 0 && !differs(at(left - 1, sy))) left -= 1;
  let right = sx;
  while (right < width - 1 && !differs(at(right + 1, sy))) right += 1;
  let up = sy;
  while (up > 0 && !differs(at(sx, up - 1))) up -= 1;
  let down = sy;
  while (down < height - 1 && !differs(at(sx, down + 1))) down += 1;
  return { x: sx, y: sy, left, right: right + 1, up, down: down + 1 };
}

// ---- Backdrop ----

export const BACKDROPS = [
  { value: "peach", label: "Peach", stops: ["#f6d365", "#fda085"] },
  { value: "sky", label: "Sky", stops: ["#a1c4fd", "#c2e9fb"] },
  { value: "lilac", label: "Lilac", stops: ["#a18cd1", "#fbc2eb"] },
  { value: "mint", label: "Mint", stops: ["#d4fc79", "#96e6a1"] },
  { value: "dusk", label: "Dusk", stops: ["#2b5876", "#4e4376"] },
  { value: "ember", label: "Ember", stops: ["#f83600", "#f9d423"] },
  { value: "sand", label: "Sand", stops: ["#efe6d8"] },
  { value: "ink", label: "Ink", stops: ["#1e1b16"] },
  { value: "white", label: "White", stops: ["#ffffff"] },
  { value: "none", label: "Clear", stops: [] },
];

const ASPECTS = { auto: 0, "16:9": 16 / 9, "1:1": 1, "4:3": 4 / 3 };

/** CSS for a backdrop preset, for swatches and the live preview. */
export function backdropCss(value) {
  const preset = BACKDROPS.find((entry) => entry.value === value) ?? BACKDROPS[0];
  if (!preset.stops.length) return "repeating-conic-gradient(#e8e1d5 0 25%, #fffdfa 0 50%) 0 0 / 16px 16px";
  if (preset.stops.length === 1) return preset.stops[0];
  return `linear-gradient(135deg, ${preset.stops.join(", ")})`;
}

/** Where the image sits inside the backdrop: total size, image offset, padding and corner radius (px). */
export function backdropLayout(cw, ch, opts) {
  if (!opts?.on) return { width: cw, height: ch, x: 0, y: 0, radius: 0, shadow: 0 };
  const short = Math.min(cw, ch);
  const pad = Math.round((short * (opts.padding ?? 8)) / 100);
  let width = cw + pad * 2;
  let height = ch + pad * 2;
  const ratio = ASPECTS[opts.aspect] ?? 0;
  if (ratio) {
    if (width / height < ratio) width = Math.round(height * ratio);
    else height = Math.round(width / ratio);
  }
  const radius = Math.round((short * (opts.radius ?? 1.5)) / 100);
  return { width, height, x: Math.round((width - cw) / 2), y: Math.round((height - ch) / 2), radius, shadow: opts.shadow ? short * 0.035 : 0 };
}

/** Puts the finished picture onto its backdrop. */
export function withBackdrop(content, opts) {
  if (!opts?.on) return content;
  const layout = backdropLayout(content.width, content.height, opts);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  const preset = BACKDROPS.find((entry) => entry.value === opts.bg) ?? BACKDROPS[0];
  if (preset.stops.length) {
    if (preset.stops.length === 1) {
      ctx.fillStyle = preset.stops[0];
    } else {
      const gradient = ctx.createLinearGradient(0, 0, layout.width, layout.height);
      preset.stops.forEach((stop, i) => gradient.addColorStop(i / (preset.stops.length - 1), stop));
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  ctx.save();
  if (layout.shadow) {
    ctx.shadowColor = "rgba(20,14,8,0.35)";
    ctx.shadowBlur = layout.shadow;
    ctx.shadowOffsetY = layout.shadow * 0.35;
    ctx.beginPath();
    ctx.roundRect(layout.x, layout.y, content.width, content.height, layout.radius);
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.x, layout.y, content.width, content.height, layout.radius);
  ctx.clip();
  ctx.drawImage(content, layout.x, layout.y);
  ctx.restore();
  return canvas;
}

// ---- Finished picture ----

/** The edited picture as a canvas: crop, shapes, backdrop, and the 1× / 2× choice. */
export function renderDoc(doc, { backdrop, scale = "2x" } = {}) {
  const { base, shapes, crop } = doc;
  const unit = unitFor(base.width, base.height);
  const full = document.createElement("canvas");
  full.width = base.width;
  full.height = base.height;
  drawScene(full.getContext("2d"), base, shapes, unit);
  const area = crop ? norm(crop) : { x: 0, y: 0, w: base.width, h: base.height };
  let content = full;
  if (crop) {
    content = document.createElement("canvas");
    content.width = Math.max(1, Math.round(area.w));
    content.height = Math.max(1, Math.round(area.h));
    content.getContext("2d").drawImage(full, area.x, area.y, area.w, area.h, 0, 0, content.width, content.height);
  }
  let out = withBackdrop(content, backdrop);
  // Retina captures have 2 pixels per point; 1× halves them to what you'd see on a normal screen.
  const ratio = doc.dpr > 1 && scale === "1x" ? 1 / doc.dpr : 1;
  if (ratio !== 1) {
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(out.width * ratio));
    small.height = Math.max(1, Math.round(out.height * ratio));
    const ctx = small.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(out, 0, 0, small.width, small.height);
    out = small;
  }
  return out;
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the image"))), type, quality));
}

/** Encodes for saving. JPG has no transparency, so a clear backdrop gets a white one. */
export async function encode(canvas, format, quality) {
  if (format !== "jpg") return canvasToBlob(canvas, "image/png");
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return canvasToBlob(flat, "image/jpeg", quality);
}

/** A file name from a pattern with {date} {time} {n} {w} {h}. */
export function fileName(pattern, { n = 1, width, height, ext }) {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  const name = (pattern || "Screenshot {date} at {time}")
    .replaceAll("{date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{n}", String(n))
    .replaceAll("{w}", String(width ?? ""))
    .replaceAll("{h}", String(height ?? ""))
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
  return `${name || "Screenshot"}.${ext}`;
}
