"use client";

import { Eraser, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useStoredState } from "@/hooks/use-stored-state";
import { SIGNATURE_FONTS, cssFamily, loadFont } from "@/lib/tools/pdf/fonts";
import { blobToDataUrl, trimTransparent } from "@/lib/tools/pdf/images";
import { cn } from "@/lib/utils";
import { BackgroundRemover, CHECKERBOARD } from "./background-remover";

const PENS = ["#111111", "#1d3f9a", "#b42318"];
const NONE = [];

function DrawPad({ color, onChange }) {
  const canvas = useRef(null);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const element = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = element.offsetWidth * ratio;
    element.height = element.offsetHeight * ratio;
    element.getContext("2d").scale(ratio, ratio);
  }, []);

  const point = (event) => {
    const rect = canvas.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top, event.pressure || 0.5];
  };

  const draw = (event) => {
    if (!last.current) return;
    const context = canvas.current.getContext("2d");
    const [x, y, pressure] = point(event);
    const [lx, ly, lmx, lmy] = last.current;
    const mx = (lx + x) / 2;
    const my = (ly + y) / 2;
    context.strokeStyle = color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 1.6 + pressure * 2.4;
    context.beginPath();
    context.moveTo(lmx, lmy);
    context.quadraticCurveTo(lx, ly, mx, my);
    context.stroke();
    last.current = [x, y, mx, my];
  };

  const finish = () => {
    if (!last.current) return;
    last.current = null;
    setEmpty(false);
    const trimmed = trimTransparent(canvas.current, 6);
    onChange({ src: trimmed.toDataURL("image/png"), width: trimmed.width, height: trimmed.height });
  };

  const clear = () => {
    const element = canvas.current;
    element.getContext("2d").clearRect(0, 0, element.width, element.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const [x, y] = point(event);
          last.current = [x, y, x, y];
        }}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="h-52 w-full touch-none rounded-xl border-2 border-dashed border-ink-4/60 bg-white"
      />
      {empty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-4">
          Sign here with your finger or mouse
        </p>
      )}
      <span className="pointer-events-none absolute right-6 bottom-12 left-6 border-b border-ink-4/40" />
      <button
        type="button"
        onClick={clear}
        className="absolute top-2 right-2 flex h-7 items-center gap-1 rounded-md bg-surface/90 px-2 text-xs font-medium text-ink-2 shadow-card hover:text-ink"
      >
        <Eraser className="size-[1.3rem]" />
        Clear
      </button>
    </div>
  );
}

async function renderTyped(text, font, color) {
  await loadFont(font);
  const size = 120;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${size}px "${cssFamily(font)}"`;
  canvas.width = Math.ceil(context.measureText(text).width + size);
  canvas.height = size * 2;
  context.font = `${size}px "${cssFamily(font)}"`;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, size / 2, size);
  const trimmed = trimTransparent(canvas, 8);
  return { src: trimmed.toDataURL("image/png"), width: trimmed.width, height: trimmed.height };
}

export function SignatureDialog({ open, onOpenChange, onUse }) {
  const [mode, setMode] = useState("draw");
  const [pen, setPen] = useState(PENS[0]);
  const [drawn, setDrawn] = useState(null);
  const [name, setName] = useState("");
  const [font, setFont] = useState(SIGNATURE_FONTS[0].id);
  const [upload, setUpload] = useState(null);
  const [cleaned, setCleaned] = useState(null);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useStoredState("pdf-editor:signatures", NONE);
  const fileInput = useRef(null);

  useEffect(() => {
    if (open) SIGNATURE_FONTS.forEach((item) => loadFont(item.id).catch(() => {}));
  }, [open]);

  const onCleaned = useCallback((src, width, height) => setCleaned(src ? { src, width, height } : null), []);

  const use = async (result) => {
    if (!result) return;
    if (remember && !saved.some((item) => item.src === result.src)) {
      setSaved((current) => [result, ...current].slice(0, 6));
    }
    onUse(result);
    onOpenChange(false);
  };

  const current = async () => {
    if (mode === "draw") return drawn;
    if (mode === "type") return name.trim() ? renderTyped(name.trim(), font, pen) : null;
    if (mode === "upload") return cleaned ?? upload;
    return null;
  };

  const ready = (mode === "draw" && drawn) || (mode === "type" && name.trim()) || (mode === "upload" && upload);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add signature" className="max-w-[52rem]">
      <Segmented
        value={mode}
        onChange={setMode}
        label="Signature type"
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        options={[
          { value: "draw", label: "Draw" },
          { value: "type", label: "Type" },
          { value: "upload", label: "Photo" },
          ...(saved.length ? [{ value: "saved", label: "Saved", count: saved.length }] : []),
        ]}
      />

      <div className="mt-4">
        {mode === "draw" && <DrawPad color={pen} onChange={setDrawn} />}

        {mode === "type" && (
          <div className="grid gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Type your name"
              className="h-11 rounded-xl bg-sunken px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
            />
            <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {SIGNATURE_FONTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFont(item.id)}
                  className={cn(
                    "flex h-16 items-center justify-center truncate rounded-xl border-2 border-transparent bg-sunken px-3 text-[2.6rem] transition-colors hover:bg-hover",
                    font === item.id && "border-ink bg-surface",
                  )}
                  style={{ fontFamily: `"${cssFamily(item.id)}"`, color: pen }}
                >
                  {name.trim() || "Your Name"}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "upload" &&
          (upload ? (
            <BackgroundRemover src={upload.src} onResult={onCleaned} />
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-52 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-4/60 bg-sunken/60 text-sm text-ink-2 transition-colors hover:bg-sunken"
            >
              <Upload className="size-[2.2rem] text-ink-3" />
              <span className="font-medium">Upload a photo of your signature</span>
              <span className="text-xs text-ink-4">Sign on white paper — the background is removed for you</span>
            </button>
          ))}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) setUpload({ src: await blobToDataUrl(file) });
          }}
        />

        {mode === "saved" && (
          <div className="grid grid-cols-2 gap-2">
            {saved.map((item) => (
              <div key={item.src} className="group relative">
                <button
                  type="button"
                  onClick={() => use(item)}
                  className="flex h-24 w-full items-center justify-center rounded-xl p-2 ring-ink transition-shadow hover:ring-2"
                  style={CHECKERBOARD}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt="Saved signature" className="max-h-full max-w-full object-contain" />
                </button>
                <button
                  type="button"
                  aria-label="Delete saved signature"
                  onClick={() => setSaved((current) => current.filter((entry) => entry.src !== item.src))}
                  className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-surface/90 text-ink-3 shadow-card hover:text-danger"
                >
                  <Trash2 className="size-[1.3rem]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {mode !== "saved" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {mode !== "upload" && (
            <div className="flex items-center gap-1.5">
              {PENS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`Ink ${colour}`}
                  onClick={() => setPen(colour)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-surface", pen === colour && "ring-2 ring-ink")}
                  style={{ background: colour }}
                />
              ))}
            </div>
          )}
          {mode === "upload" && upload && (
            <button type="button" onClick={() => setUpload(null)} className="text-xs font-medium text-ink-3 hover:text-ink">
              Choose another photo
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="accent-ink" />
            Save for next time
          </label>
          <button
            type="button"
            disabled={!ready}
            onClick={async () => use(await current())}
            className="h-10 w-full rounded-xl bg-ink px-5 text-sm font-semibold text-ground transition-colors hover:bg-ink/85 disabled:opacity-40 sm:w-auto"
          >
            Use signature
          </button>
        </div>
      )}
    </Dialog>
  );
}
