"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const ASPECTS = [
  { value: "free", label: "Free" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
];

const ratioOf = (aspect) => {
  if (aspect === "free") return null;
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const MIN = 0.04;

/** Fits a rectangle (fractions of the frame) to an aspect ratio in real pixels, keeping it inside the frame. */
export function fitAspect(rect, aspect, width, height) {
  const ratio = ratioOf(aspect);
  if (!ratio || !width || !height) return rect;
  let w = rect.w;
  let h = (w * width) / (height * ratio);
  if (h > 1) {
    h = 1;
    w = (h * height * ratio) / width;
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { w, h, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h) };
}

export const DEFAULT_AREA = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };

/** Live view of the shared screen with a draggable, resizable selection rectangle. */
export function AreaPicker({ stream, value, onChange, aspect }) {
  const video = useRef(null);
  const box = useRef(null);
  const drag = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  const point = (event) => {
    const rect = box.current.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };

  const fromCorners = (anchor, p) => {
    const ratio = ratioOf(aspect);
    let w = Math.max(MIN, Math.abs(p.x - anchor.x));
    let h = Math.max(MIN, Math.abs(p.y - anchor.y));
    if (ratio && size) h = (w * size.width) / (size.height * ratio);
    const x = p.x < anchor.x ? anchor.x - w : anchor.x;
    const y = p.y < anchor.y ? anchor.y - h : anchor.y;
    const cx = clamp(x, 0, 1 - Math.min(w, 1));
    const cy = clamp(y, 0, 1 - Math.min(h, 1));
    return { x: cx, y: cy, w: Math.min(w, 1 - cx), h: Math.min(h, 1 - cy) };
  };

  const onPointerDown = (event, mode, corner) => {
    event.preventDefault();
    event.stopPropagation();
    box.current.setPointerCapture(event.pointerId);
    const p = point(event);
    if (mode === "move") drag.current = { mode, start: p, origin: value };
    else if (mode === "resize") {
      const anchor = { x: corner.includes("l") ? value.x + value.w : value.x, y: corner.includes("t") ? value.y + value.h : value.y };
      drag.current = { mode, anchor };
    } else drag.current = { mode: "resize", anchor: p };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state) return;
    const p = point(event);
    if (state.mode === "move") {
      const { origin, start } = state;
      onChange({ ...origin, x: clamp(origin.x + p.x - start.x, 0, 1 - origin.w), y: clamp(origin.y + p.y - start.y, 0, 1 - origin.h) });
    } else {
      onChange(fromCorners(state.anchor, p));
    }
  };

  const end = () => {
    drag.current = null;
  };

  const px = size ? `${Math.round(value.w * size.width)} × ${Math.round(value.h * size.height)}` : "";

  return (
    <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-black">
      <div
        ref={box}
        className="relative max-h-[60vh] w-full cursor-crosshair touch-none select-none"
        style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "16 / 9", maxWidth: size ? `calc(60vh * ${size.width / size.height})` : undefined }}
        onPointerDown={(event) => onPointerDown(event, "new")}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={(event) => setSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
          onResize={(event) => setSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
          className="pointer-events-none size-full object-fill"
        />
        <div
          className="absolute cursor-move outline-2 outline-danger shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]"
          style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%`, width: `${value.w * 100}%`, height: `${value.h * 100}%` }}
          onPointerDown={(event) => onPointerDown(event, "move")}
        >
          <span className="absolute -top-7 left-0 rounded-md bg-danger px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap text-white tabular-nums">{px}</span>
          {["tl", "tr", "bl", "br"].map((corner) => (
            <span
              key={corner}
              onPointerDown={(event) => onPointerDown(event, "resize", corner)}
              className={cn(
                "absolute size-3.5 rounded-sm bg-white shadow-card ring-2 ring-danger",
                corner.includes("t") ? "-top-1.5" : "-bottom-1.5",
                corner.includes("l") ? "-left-1.5 cursor-nwse-resize" : "-right-1.5 cursor-nesw-resize",
                (corner === "tl" || corner === "br") && "cursor-nwse-resize",
                (corner === "tr" || corner === "bl") && "cursor-nesw-resize",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
