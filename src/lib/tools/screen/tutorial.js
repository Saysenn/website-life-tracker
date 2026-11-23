/**
 * Tutorial effects drawn into the recording: smooth zoom to a point (follows clicks and typing), a magnifier lens,
 * click ripples, drawings (pen, highlighter, arrow, box) and a badge for keyboard shortcuts.
 *
 * Positions come in two ways:
 *  - from the tutorial pad (the live preview in the floating bar or on the page): `u, v` 0–1 across the finished video;
 *  - from the browser extension (clicks, the typing caret and the mouse in browser tabs): mapped from page
 *    coordinates into the captured picture with `mapInput`.
 * Drawings and ripples stick to the screen underneath, so they zoom with it; the lens and key badge don't.
 */

export const TUTORIAL_DEFAULTS = {
  tutorial: false,
  tZoomOnClick: true,
  tZoomLevel: 2,
  tFollowTyping: true,
  tZoomOutAfter: 3,
  tZoomSpeed: "smooth",
  tLensSize: "m",
  tLensPower: 2,
  tLensFollowMouse: true,
  tClicks: true,
  tClickColor: "#f2c94c",
  tInk: "#e0453a",
  tInkWidth: "m",
  tFade: 0,
  tKeys: true,
};

const LENS_SIZES = { s: 0.09, m: 0.13, l: 0.19 };
const INK_WIDTHS = { s: 0.0025, m: 0.0045, l: 0.008 };
const SPEEDS = { smooth: 5, fast: 10 };
const RIPPLE_MS = 650;
const KEY_MS = 1400;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class TutorialFx {
  constructor(options) {
    this.options = { ...TUTORIAL_DEFAULTS, ...options };
    this.zoom = 1;
    this.zoomTarget = 1;
    this.center = { x: 0.5, y: 0.5 };
    this.centerTarget = { x: 0.5, y: 0.5 };
    this.zoomUntil = 0; // 0 = stays until zoomed out by hand
    this.lens = null;
    this.ripples = [];
    this.strokes = [];
    this.drawing = null;
    this.keys = null;
    this.last = performance.now();
  }

  update(options) {
    this.options = { ...this.options, ...options };
  }

  /** The part of the picture in view at the current zoom, in output pixels. */
  view(W, H) {
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    return { x: clamp(this.center.x * W - vw / 2, 0, W - vw), y: clamp(this.center.y * H - vh / 2, 0, H - vh), w: vw, h: vh };
  }

  /** A point on the finished (zoomed) video → the same spot on the un-zoomed picture, both 0–1. */
  toBase(u, v) {
    const W = 1;
    const H = 1;
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    const vx = clamp(this.center.x - vw / 2, 0, W - vw);
    const vy = clamp(this.center.y - vh / 2, 0, H - vh);
    return { x: vx + u * vw, y: vy + v * vh };
  }

  // ---- Zoom ----

  /** Zooms to a spot on the un-zoomed picture. `hold` keeps it until zoomOut(). */
  zoomTo(x, y, { hold = false, level } = {}) {
    this.centerTarget = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    this.zoomTarget = level ?? this.options.tZoomLevel;
    const after = this.options.tZoomOutAfter;
    this.zoomUntil = hold || !after ? 0 : performance.now() + after * 1000;
  }

  /** Keeps a zoom going (typing), and moves it along to the caret if asked. */
  follow(x, y) {
    if (this.zoomTarget <= 1) return;
    if (this.options.tFollowTyping) this.centerTarget = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    if (this.zoomUntil) this.zoomUntil = performance.now() + Math.max(1, this.options.tZoomOutAfter) * 1000;
  }

  zoomOut() {
    this.zoomTarget = 1;
    this.zoomUntil = 0;
  }

  get zoomed() {
    return this.zoomTarget > 1;
  }

  // ---- Input from the pad or the extension (positions on the un-zoomed picture, 0–1) ----

  click(x, y) {
    if (this.options.tClicks) this.ripples.push({ x, y, t: performance.now() });
    if (this.options.tZoomOnClick) this.zoomTo(x, y);
  }

  caret(x, y) {
    if (this.options.tFollowTyping && this.zoomed) this.follow(x, y);
  }

  pointer(x, y) {
    this.lensAt(x, y, true);
  }

  key(label) {
    if (this.options.tKeys) this.keys = { label, t: performance.now() };
  }

  /** Lens over a point; `base` says the point is on the un-zoomed picture (else on the finished video). */
  lensAt(x, y, base = false) {
    this.lens = x == null ? null : { x, y, base, t: performance.now() };
  }

  // ---- Drawing ----

  strokeStart(tool, x, y) {
    const point = { x, y };
    this.drawing = { tool, color: this.options.tInk, width: this.options.tInkWidth, points: [point], from: point, to: point, t: performance.now() };
    this.strokes.push(this.drawing);
  }

  strokeMove(x, y) {
    const stroke = this.drawing;
    if (!stroke) return;
    stroke.to = { x, y };
    if (stroke.tool === "pen" || stroke.tool === "marker") {
      const last = stroke.points.at(-1);
      if (Math.hypot(last.x - x, last.y - y) > 0.0015) stroke.points.push({ x, y });
    }
  }

  strokeEnd() {
    if (this.drawing) this.drawing.t = performance.now();
    this.drawing = null;
  }

  undo() {
    this.strokes.pop();
  }

  clear() {
    this.strokes = [];
    this.drawing = null;
  }

  // ---- Per frame ----

  step() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.zoomUntil && now > this.zoomUntil) this.zoomOut();
    const k = 1 - Math.exp(-dt * (SPEEDS[this.options.tZoomSpeed] ?? SPEEDS.smooth));
    this.zoom += (this.zoomTarget - this.zoom) * k;
    if (Math.abs(this.zoom - this.zoomTarget) < 0.002) this.zoom = this.zoomTarget;
    this.center.x += (this.centerTarget.x - this.center.x) * k;
    this.center.y += (this.centerTarget.y - this.center.y) * k;
    this.ripples = this.ripples.filter((ripple) => now - ripple.t < RIPPLE_MS);
    const fade = this.options.tFade * 1000;
    if (fade) this.strokes = this.strokes.filter((stroke) => stroke === this.drawing || now - stroke.t < fade + 400);
    if (this.keys && now - this.keys.t > KEY_MS) this.keys = null;
    if (this.lens?.base && now - this.lens.t > 2500) this.lens = null;
    return now;
  }

  /** Effects that sit on the screen picture: called inside the zoom transform, in un-zoomed output pixels. */
  drawAttached(ctx, W, H, now) {
    const unit = Math.min(W, H);
    for (const stroke of this.strokes) {
      const fade = this.options.tFade * 1000;
      const age = now - stroke.t;
      const alpha = fade && stroke !== this.drawing ? clamp(1 - (age - fade) / 400, 0, 1) : 1;
      if (alpha <= 0) continue;
      drawStroke(ctx, stroke, W, H, unit, alpha);
    }
    for (const ripple of this.ripples) {
      const p = (now - ripple.t) / RIPPLE_MS;
      const r = unit * (0.012 + p * 0.035);
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = this.options.tClickColor;
      ctx.lineWidth = unit * 0.006;
      ctx.beginPath();
      ctx.arc(ripple.x * W, ripple.y * H, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.35;
      ctx.fillStyle = this.options.tClickColor;
      ctx.beginPath();
      ctx.arc(ripple.x * W, ripple.y * H, unit * 0.012, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * The lens, on top of the finished picture. `sample(bx, by)` turns a spot on the un-zoomed picture (0–1) into
   * { image, sx, sy, scale } — the source frame, the pixel there, and source pixels per output pixel.
   */
  drawLens(ctx, W, H, sample) {
    const lens = this.lens;
    if (!lens) return;
    const unit = Math.min(W, H);
    const r = unit * (LENS_SIZES[this.options.tLensSize] ?? LENS_SIZES.m);
    let at;
    let base;
    if (lens.base) {
      base = { x: lens.x, y: lens.y };
      const view = this.view(1, 1);
      at = { x: (lens.x - view.x) / view.w, y: (lens.y - view.y) / view.h };
    } else {
      at = { x: lens.x, y: lens.y };
      base = this.toBase(lens.x, lens.y);
    }
    const src = sample(base.x, base.y);
    if (!src) return;
    const power = this.options.tLensPower * this.zoom;
    const half = (r / power) * src.scale;
    const cx = at.x * W;
    const cy = at.y * H;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = r * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    try {
      ctx.drawImage(src.image, src.sx - half, src.sy - half, half * 2, half * 2, cx - r, cy - r, r * 2, r * 2);
    } catch {}
    ctx.restore();
    ctx.save();
    ctx.lineWidth = Math.max(2, r * 0.04);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** The "⌘ C" badge at the bottom centre. */
  drawKeys(ctx, W, H, now) {
    if (!this.keys) return;
    const age = now - this.keys.t;
    const alpha = clamp(Math.min(age / 120, (KEY_MS - age) / 250), 0, 1);
    const px = Math.round(Math.max(14, Math.min(W, H) * 0.035));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const tw = ctx.measureText(this.keys.label).width;
    const padX = px * 0.8;
    const bw = tw + padX * 2;
    const bh = px * 1.9;
    const x = (W - bw) / 2;
    const y = H - bh - Math.min(W, H) * 0.05;
    ctx.fillStyle = "rgba(24,20,16,0.82)";
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, bh * 0.28);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(this.keys.label, x + padX, y + bh / 2 + px * 0.04);
    ctx.restore();
  }
}

function drawStroke(ctx, stroke, W, H, unit, alpha) {
  const width = unit * (INK_WIDTHS[stroke.width] ?? INK_WIDTHS.m);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.tool === "pen" || stroke.tool === "marker") {
    if (stroke.tool === "marker") {
      ctx.globalAlpha = alpha * 0.38;
      ctx.lineWidth = width * 5;
      ctx.lineCap = "square";
    } else {
      ctx.lineWidth = width;
    }
    ctx.beginPath();
    stroke.points.forEach((point, i) => ctx[i ? "lineTo" : "moveTo"](point.x * W, point.y * H));
    if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * W + 0.1, stroke.points[0].y * H);
    ctx.stroke();
  } else if (stroke.tool === "box") {
    ctx.lineWidth = width;
    const x = Math.min(stroke.from.x, stroke.to.x) * W;
    const y = Math.min(stroke.from.y, stroke.to.y) * H;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.abs(stroke.to.x - stroke.from.x) * W, Math.abs(stroke.to.y - stroke.from.y) * H, width * 1.5);
    ctx.stroke();
  } else if (stroke.tool === "arrow") {
    const x1 = stroke.from.x * W;
    const y1 = stroke.from.y * H;
    const x2 = stroke.to.x * W;
    const y2 = stroke.to.y * H;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(width * 4, 10);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Where a click / caret / mouse position reported by the extension lands in the captured picture (0–1 of the
 * whole captured frame), or null when it can't be on it. `surface` is the track's displaySurface.
 * The event carries the page position and the window's geometry, all in CSS pixels.
 */
export function mapInput(event, surface) {
  const { x, y, iw, ih, ow, oh, sx, sy, sw, sh, sl = 0, st = 0 } = event;
  if (!iw || !ih) return null;
  let fx;
  let fy;
  if (surface === "browser") {
    fx = x / iw;
    fy = y / ih;
  } else if (surface === "window") {
    // The page sits at the bottom of the window, under the tabs and address bar.
    fx = (x + (ow - iw) / 2) / ow;
    fy = (y + (oh - ih)) / oh;
  } else {
    fx = (sx - sl + (ow - iw) / 2 + x) / sw;
    fy = (sy - st + (oh - ih) + y) / sh;
  }
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
  return { x: fx, y: fy };
}
