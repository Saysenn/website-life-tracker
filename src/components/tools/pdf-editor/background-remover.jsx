"use client";

import { useEffect, useState } from "react";
import { loadImage, removeBackground } from "@/lib/tools/pdf/images";
import { cn } from "@/lib/utils";

export const CHECKERBOARD = {
  backgroundImage:
    "linear-gradient(45deg,#e7e2d9 25%,transparent 25%),linear-gradient(-45deg,#e7e2d9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e2d9 75%),linear-gradient(-45deg,transparent 75%,#e7e2d9 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
  backgroundColor: "#fff",
};

const INKS = [
  { value: null, label: "Original" },
  { value: "#111111", label: "Black" },
  { value: "#1d3f9a", label: "Blue" },
];

/**
 * Live preview of background removal. Calls onResult(dataUrl | null) whenever
 * the output changes (null = removal turned off, use the original).
 */
export function BackgroundRemover({ src, onResult, defaultOn = true }) {
  const [enabled, setEnabled] = useState(defaultOn);
  const [tolerance, setTolerance] = useState(30);
  const [ink, setInk] = useState(null);
  const [preview, setPreview] = useState(src);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!enabled) {
        setPreview(src);
        onResult(null);
        return;
      }
      const image = await loadImage(src);
      if (cancelled) return;
      const canvas = removeBackground(image, { tolerance, ink });
      const url = canvas.toDataURL("image/png");
      if (cancelled) return;
      setPreview(url);
      onResult(url, canvas.width, canvas.height);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [src, enabled, tolerance, ink, onResult]);

  return (
    <div className="grid gap-3">
      <div className="flex h-52 items-center justify-center overflow-hidden rounded-xl p-3" style={CHECKERBOARD}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Preview" className="max-h-full max-w-full object-contain" />
      </div>

      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        Remove background
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-ink" />
      </label>

      {enabled && (
        <>
          <label className="grid gap-1">
            <span className="flex justify-between text-xs text-ink-3">
              <span>Strength</span>
              <span className="tabular-nums">{tolerance}</span>
            </span>
            <input
              type="range"
              min={0}
              max={90}
              value={tolerance}
              onChange={(event) => setTolerance(Number(event.target.value))}
              className="h-6 w-full accent-ink"
            />
            <span className="text-2xs text-ink-4">Raise it if paper or shadows are still showing.</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-3">Ink</span>
            {INKS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setInk(option.value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-hover",
                  ink === option.value && "bg-ink text-ground hover:bg-ink",
                )}
              >
                {option.value && <span className="size-3 rounded-full" style={{ background: option.value }} />}
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
