"use client";

import { Eraser, Highlighter, MousePointerClick, MoveUpRight, Pen, Square, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const TUTORIAL_TOOLS = [
  { value: "click", label: "Click to zoom", key: "1", icon: MousePointerClick },
  { value: "lens", label: "Magnifier", key: "2", icon: ZoomIn },
  { value: "pen", label: "Pen", key: "3", icon: Pen },
  { value: "marker", label: "Highlighter", key: "4", icon: Highlighter },
  { value: "arrow", label: "Arrow", key: "5", icon: MoveUpRight },
  { value: "box", label: "Box", key: "6", icon: Square },
];

export const INK_COLORS = ["#e0453a", "#f2c94c", "#4f8a3c", "#2f6fd6", "#7a4fd6", "#ffffff", "#1e1b16"];

/** Tool keys while recording with tutorial mode: 1–6 pick a tool, Z zooms out, U undoes, C clears. */
export function tutorialKey(event, { setTool, fx }) {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.target.closest?.("input, textarea, select, [contenteditable]")) return false;
  const tool = TUTORIAL_TOOLS.find((entry) => entry.key === event.key);
  if (tool) setTool(tool.value);
  else if (event.code === "KeyZ") fx?.zoomOut();
  else if (event.code === "KeyU" || event.key === "Backspace") fx?.undo();
  else if (event.code === "KeyC") fx?.clear();
  else return false;
  event.preventDefault();
  return true;
}

export function TutorialToolbar({ tool, setTool, ink, setInk, getFx, compact = false }) {
  const button = "flex shrink-0 items-center justify-center rounded-lg transition-colors [&_svg]:size-[1.5rem]";
  const size = compact ? "size-8" : "size-9";
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto", compact && "px-2")} role="toolbar" aria-label="Tutorial tools">
      {TUTORIAL_TOOLS.map((entry) => {
        const Icon = entry.icon;
        const active = tool === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            onClick={() => setTool(entry.value)}
            title={`${entry.label} (${entry.key})`}
            aria-label={entry.label}
            aria-pressed={active}
            className={cn(button, size, active ? "bg-ink text-ground" : "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")}
          >
            <Icon />
          </button>
        );
      })}
      <span className="mx-1 h-5 w-px shrink-0 bg-hover" />
      <div className="flex shrink-0 items-center gap-0.5">
        {INK_COLORS.slice(0, compact ? 4 : INK_COLORS.length).map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setInk(color)}
            aria-label={`Ink ${color}`}
            aria-pressed={ink === color}
            className={cn("flex size-7 items-center justify-center rounded-full", ink === color && "bg-hover")}
          >
            <span className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: color }} />
          </button>
        ))}
      </div>
      <span className="flex-1" />
      <button type="button" onClick={() => getFx()?.zoomOut()} title="Zoom out (Z)" aria-label="Zoom out" className={cn(button, size, "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")}>
        <ZoomOut />
      </button>
      <button type="button" onClick={() => getFx()?.undo()} title="Undo drawing (U)" aria-label="Undo drawing" className={cn(button, size, "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")}>
        <Undo2 />
      </button>
      <button type="button" onClick={() => getFx()?.clear()} title="Clear drawings (C)" aria-label="Clear drawings" className={cn(button, size, "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")}>
        <Eraser />
      </button>
    </div>
  );
}

/**
 * The live recording you can click and draw on: clicks zoom to that spot, the magnifier follows the mouse, and
 * pen / highlighter / arrow / box drawings land in the recording at the same place.
 */
export function TutorialPad({ stream, getFx, tool, countdown = 0, className }) {
  const video = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  // Where the pointer is on the recording (0–1), allowing for the letterbox of object-contain.
  const point = (event) => {
    const el = video.current;
    if (!el?.videoWidth) return null;
    const rect = el.getBoundingClientRect();
    const scale = Math.min(rect.width / el.videoWidth, rect.height / el.videoHeight);
    const w = el.videoWidth * scale;
    const h = el.videoHeight * scale;
    const u = (event.clientX - rect.left - (rect.width - w) / 2) / w;
    const v = (event.clientY - rect.top - (rect.height - h) / 2) / h;
    return { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)), inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  };

  const down = (event) => {
    const fx = getFx();
    const p = point(event);
    if (!fx || !p?.inside || event.button !== 0) return;
    const base = fx.toBase(p.u, p.v);
    if (tool === "click") return fx.click(base.x, base.y);
    if (tool === "lens") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    fx.strokeStart(tool, base.x, base.y);
  };

  const move = (event) => {
    const fx = getFx();
    const p = point(event);
    if (!fx || !p) return;
    if (tool === "lens") return fx.lensAt(p.inside ? p.u : null, p.v);
    if (!drawing.current) return;
    const base = fx.toBase(p.u, p.v);
    fx.strokeMove(base.x, base.y);
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    getFx()?.strokeEnd();
  };

  const leave = () => {
    if (tool === "lens") getFx()?.lensAt(null);
  };

  // Right-click zooms back out, like a desktop tutorial recorder.
  const context = (event) => {
    event.preventDefault();
    getFx()?.zoomOut();
  };

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-xl bg-black", className)}>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={leave}
        onContextMenu={context}
        className={cn("size-full touch-none object-contain select-none", tool === "lens" ? "cursor-none" : tool === "click" ? "cursor-zoom-in" : "cursor-crosshair")}
      />
      {countdown > 0 && (
        <span key={countdown} className="pointer-events-none absolute inset-0 flex animate-pop items-center justify-center bg-ink/40 text-[9.6rem] font-semibold text-white tabular-nums">
          {countdown}
        </span>
      )}
    </div>
  );
}
