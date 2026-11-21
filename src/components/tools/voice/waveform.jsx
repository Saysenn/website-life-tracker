"use client";

import { useEffect, useRef } from "react";
import { peaks } from "@/lib/tools/voice/clean";
import { cn } from "@/lib/utils";

const COLORS = { ink: "#b8ae9f", data: "#2f6f9f", danger: "#a63f2a" };

function setup(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  return { ctx: canvas.getContext("2d"), width: canvas.width, height: canvas.height, ratio };
}

/** A static waveform with a playhead; click or drag to seek. `progress` and the seek value are 0–1. */
export function Waveform({ samples, progress = 0, onSeek, tone = "data", dim = false, label, className }) {
  const canvas = useRef(null);
  const cache = useRef({ samples: null, columns: 0, data: null });

  useEffect(() => {
    const element = canvas.current;
    if (!element || !samples) return;
    const draw = () => {
      const { ctx, width, height, ratio } = setup(element);
      const bar = 2 * ratio;
      const gap = 1 * ratio;
      const columns = Math.max(1, Math.floor(width / (bar + gap)));
      if (cache.current.samples !== samples || cache.current.columns !== columns) {
        cache.current = { samples, columns, data: peaks(samples, columns) };
      }
      const data = cache.current.data;
      let max = 0.001;
      for (const value of data) max = Math.max(max, Math.abs(value));
      ctx.clearRect(0, 0, width, height);
      const mid = height / 2;
      const played = Math.floor(progress * columns);
      for (let c = 0; c < columns; c += 1) {
        const lo = data[c * 2] / max;
        const hi = data[c * 2 + 1] / max;
        const h = Math.max(ratio, (hi - lo) * mid * 0.95);
        ctx.fillStyle = c < played ? COLORS[tone] : dim ? "#ddd5c8" : `${COLORS[tone]}66`;
        ctx.fillRect(c * (bar + gap), mid - (hi * mid * 0.95 + (h - (hi - lo) * mid * 0.95) / 2), bar, h);
      }
      if (progress > 0 && progress < 1) {
        ctx.fillStyle = COLORS.danger;
        ctx.fillRect(Math.round(progress * width), 0, ratio * 1.5, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [samples, progress, tone, dim]);

  const seek = (event) => {
    if (!onSeek || (event.type === "pointermove" && event.buttons !== 1)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  };

  return (
    <div className={cn("relative", className)}>
      {label && <span className="pointer-events-none absolute top-1 left-2 z-10 text-2xs font-semibold text-ink-3">{label}</span>}
      <canvas ref={canvas} onPointerDown={seek} onPointerMove={seek} className={cn("block h-full w-full touch-none", onSeek && "cursor-pointer")} />
    </div>
  );
}

/** A scrolling level graph of a live input while recording. */
export function LiveWave({ analyser, active, className }) {
  const canvas = useRef(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !analyser) return;
    const buffer = new Float32Array(analyser.fftSize);
    const history = [];
    let frame;
    const loop = () => {
      const { ctx, width, height, ratio } = setup(element);
      const bar = 3 * ratio;
      const gap = 2 * ratio;
      const columns = Math.floor(width / (bar + gap));
      if (active) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value * value;
        const db = 10 * Math.log10(sum / buffer.length + 1e-10);
        history.push(Math.max(0.02, Math.min(1, (db + 60) / 54)));
        while (history.length > columns) history.shift();
      }
      ctx.clearRect(0, 0, width, height);
      const mid = height / 2;
      history.forEach((level, i) => {
        const x = width - (history.length - i) * (bar + gap);
        const h = level * height * 0.9;
        ctx.fillStyle = active ? COLORS.danger : COLORS.ink;
        ctx.fillRect(x, mid - h / 2, bar, h);
      });
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  return <canvas ref={canvas} className={cn("block h-full w-full", className)} />;
}
