"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { colorAt, hex } from "@/lib/tools/shot/render";

const LOUPE_CELLS = 15;
const LOUPE_PX = 135;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Picks an area of a frozen screen capture, Shottr style: crosshair, a pixel loupe with the colour
 * and position under the cursor, and the size while dragging.
 * Release to take it (or, with `confirm`, adjust then Enter). Arrows nudge, Esc cancels,
 * Enter / Space with nothing drawn takes the whole screen.
 */
export function AreaSelect({ canvas, loupe = true, confirm = false, onDone }) {
  const view = useRef(null);
  const loupeRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState(null);
  const [sel, setSel] = useState(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const W = canvas.width;
  const H = canvas.height;
  const scale = size.w ? Math.min(size.w / W, size.h / H) : 1;
  const ox = (size.w - W * scale) / 2;
  const oy = (size.h - H * scale) / 2;

  useLayoutEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const toImage = useCallback(
    (event) => ({ x: clamp((event.clientX - ox) / scale, 0, W), y: clamp((event.clientY - oy) / scale, 0, H) }),
    [ox, oy, scale, W, H],
  );

  const finish = useCallback(
    (rect) => {
      if (!rect) return onDone(null);
      const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
      onDone(r.w >= 2 && r.h >= 2 ? r : null);
    },
    [onDone],
  );

  // The frozen screen with the outside dimmed.
  useEffect(() => {
    const el = view.current;
    if (!el || !size.w) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * ratio);
    el.height = Math.round(size.h * ratio);
    const ctx = el.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#0c0a08";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.drawImage(canvas, ox, oy, W * scale, H * scale);
    ctx.fillStyle = "rgba(12,10,8,0.38)";
    if (sel) {
      const x = ox + sel.x * scale;
      const y = oy + sel.y * scale;
      const w = sel.w * scale;
      const h = sel.h * scale;
      ctx.beginPath();
      ctx.rect(0, 0, size.w, size.h);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (confirm && !dragging) {
        ctx.fillStyle = "#ffffff";
        for (const [hx, hy] of [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ]) {
          ctx.beginPath();
          ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillRect(0, 0, size.w, size.h);
    }
    if (cursor && !(sel && !dragging && confirm)) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const cx = Math.round(ox + cursor.x * scale) + 0.5;
      const cy = Math.round(oy + cursor.y * scale) + 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, size.h);
      ctx.moveTo(0, cy);
      ctx.lineTo(size.w, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [canvas, size, sel, cursor, ox, oy, scale, W, H, confirm, dragging]);

  // The loupe: real pixels around the cursor, magnified on a grid.
  useEffect(() => {
    const el = loupeRef.current;
    if (!el || !cursor || !loupe) return;
    const ctx = el.getContext("2d");
    const cell = LOUPE_PX / LOUPE_CELLS;
    const half = Math.floor(LOUPE_CELLS / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0c0a08";
    ctx.fillRect(0, 0, LOUPE_PX, LOUPE_PX);
    ctx.drawImage(canvas, Math.floor(cursor.x) - half, Math.floor(cursor.y) - half, LOUPE_CELLS, LOUPE_CELLS, 0, 0, LOUPE_PX, LOUPE_PX);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < LOUPE_CELLS; i += 1) {
      ctx.moveTo(Math.round(i * cell) + 0.5, 0);
      ctx.lineTo(Math.round(i * cell) + 0.5, LOUPE_PX);
      ctx.moveTo(0, Math.round(i * cell) + 0.5);
      ctx.lineTo(LOUPE_PX, Math.round(i * cell) + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(half * cell, half * cell, cell, cell);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(half * cell - 1.5, half * cell - 1.5, cell + 3, cell + 3);
  }, [cursor, canvas, loupe]);

  const handleAt = (point) => {
    if (!sel) return null;
    const slack = 10 / scale;
    const near = (a, b) => Math.abs(a - b) <= slack;
    const left = near(point.x, sel.x);
    const right = near(point.x, sel.x + sel.w);
    const top = near(point.y, sel.y);
    const bottom = near(point.y, sel.y + sel.h);
    if ((left || right) && (top || bottom)) return { left, right, top, bottom };
    if (point.x > sel.x && point.x < sel.x + sel.w && point.y > sel.y && point.y < sel.y + sel.h) return "move";
    return null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toImage(event);
    const handle = confirm ? handleAt(point) : null;
    drag.current = { start: point, handle, from: sel };
    setDragging(true);
    if (!handle) setSel({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const onPointerMove = (event) => {
    const point = toImage(event);
    setCursor(point);
    const d = drag.current;
    if (!d) return;
    if (d.handle === "move") {
      const dx = point.x - d.start.x;
      const dy = point.y - d.start.y;
      setSel({ ...d.from, x: clamp(d.from.x + dx, 0, W - d.from.w), y: clamp(d.from.y + dy, 0, H - d.from.h) });
      return;
    }
    let anchor = d.start;
    if (d.handle) {
      anchor = { x: d.handle.left ? d.from.x + d.from.w : d.from.x, y: d.handle.top ? d.from.y + d.from.h : d.from.y };
    }
    let w = point.x - anchor.x;
    let h = point.y - anchor.y;
    if (event.shiftKey) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side;
    }
    setSel({ x: Math.min(anchor.x, anchor.x + w), y: Math.min(anchor.y, anchor.y + h), w: Math.abs(w), h: Math.abs(h) });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!sel || sel.w < 3 || sel.h < 3) {
      // A click without a drag: back to choosing.
      if (!d.handle) setSel(null);
      return;
    }
    if (!confirm) finish(sel);
    else setSel({ ...sel });
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (sel && confirm) setSel(null);
        else finish(null);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        finish(sel && sel.w >= 2 ? sel : { x: 0, y: 0, w: W, h: H });
        return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const step = arrows[event.key];
      if (!step) return;
      event.preventDefault();
      const n = event.shiftKey ? 10 : 1;
      if (sel) {
        // Alt / Option resizes from the bottom-right corner instead of moving.
        if (event.altKey) setSel({ ...sel, w: Math.max(2, sel.w + step[0] * n), h: Math.max(2, sel.h + step[1] * n) });
        else setSel({ ...sel, x: clamp(sel.x + step[0] * n, 0, W - sel.w), y: clamp(sel.y + step[1] * n, 0, H - sel.h) });
      } else {
        setCursor((c) => (c ? { x: clamp(c.x + step[0] * n, 0, W - 1), y: clamp(c.y + step[1] * n, 0, H - 1) } : c));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, confirm, finish, W, H]);

  const color = cursor ? hex(colorAt(canvas, cursor.x, cursor.y)) : null;
  const screenX = cursor ? ox + cursor.x * scale : 0;
  const screenY = cursor ? oy + cursor.y * scale : 0;
  const flipX = screenX + LOUPE_PX + 40 > size.w;
  const flipY = screenY + LOUPE_PX + 80 > size.h;
  const showLoupe = loupe && cursor && !(sel && confirm && !dragging);
  const label = sel && sel.w > 0 ? `${Math.round(sel.w)} × ${Math.round(sel.h)}` : null;

  return (
    <div
      className="fixed inset-0 z-[80] cursor-crosshair touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => sel && finish(sel)}
      role="dialog"
      aria-label="Select an area"
    >
      <canvas ref={view} className="absolute inset-0 size-full" />

      {label && (
        <div
          className="pointer-events-none absolute rounded-md bg-ink px-1.5 py-0.5 text-2xs font-semibold text-ground tabular-nums"
          style={{ left: ox + sel.x * scale, top: Math.max(4, oy + sel.y * scale - 22) }}
        >
          {label}
        </div>
      )}

      {showLoupe && (
        <div
          className="pointer-events-none absolute flex flex-col overflow-hidden rounded-xl bg-ink shadow-float"
          style={{ left: flipX ? screenX - LOUPE_PX - 22 : screenX + 22, top: flipY ? screenY - LOUPE_PX - 70 : screenY + 22, width: LOUPE_PX }}
        >
          <canvas ref={loupeRef} width={LOUPE_PX} height={LOUPE_PX} className="block" />
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-2xs font-semibold text-ground tabular-nums">
            <span className="size-3 shrink-0 rounded-sm ring-1 ring-white/30" style={{ background: color }} />
            <span className="uppercase">{color}</span>
            <span className="ml-auto text-ground/70">
              {Math.floor(cursor.x)},{Math.floor(cursor.y)}
            </span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg bg-ink/85 px-3 py-1.5 text-xs font-medium text-ground backdrop-blur">
        {confirm && sel && !dragging
          ? "Drag corners to adjust · arrows nudge (⌥ resizes) · Enter to take · Esc to redo"
          : "Drag to select · Shift for a square · Enter for the whole screen · Esc to cancel"}
      </div>
    </div>
  );
}
