"use client";

import { Check, Download, FileArchive, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { baseName, downloadBlob, downloadZip } from "@/lib/tools/files";
import { FRAME_FORMATS, MAX_FRAMES, extractFrames, fmtTime } from "@/lib/tools/video/frames";
import { cn, plural } from "@/lib/utils";
import { Choice, NumberField, RunButton, Select, SmallButton } from "./controls";

const MODES = [
  { value: "interval", label: "Every few sec" },
  { value: "count", label: "Set number" },
  { value: "scenes", label: "Scene changes" },
];

const SIZES = [
  ["0", "Original size"],
  ["1920", "Up to 1920 px wide"],
  ["1280", "Up to 1280 px wide"],
  ["640", "Up to 640 px wide"],
];

const frameName = (file, frame, format) => `${baseName(file.name)}-${fmtTime(frame.time, true).replace(/:/g, "-")}.${format}`;

export function FramesPanel({ file, src, duration, onSeek }) {
  const [mode, setMode] = useState("interval");
  const [every, setEvery] = useState("1");
  const [count, setCount] = useState("12");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [format, setFormat] = useState("jpg");
  const [size, setSize] = useState("0");
  const [frames, setFrames] = useState([]);
  const [unselected, setUnselected] = useState(() => new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const stop = useRef(false);

  const estimate =
    mode === "count"
      ? Number(count) || 0
      : mode === "interval"
        ? Math.min(MAX_FRAMES, Math.ceil(duration / Math.max(0.04, Number(every) || 1)))
        : null;

  const clear = () => {
    frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    setFrames([]);
    setUnselected(new Set());
  };

  const start = async () => {
    clear();
    stop.current = false;
    setRunning(true);
    setProgress(0);
    const usedFormat = format;
    try {
      await extractFrames(src, {
        mode,
        every: Number(every) || 1,
        count: Number(count) || 1,
        sensitivity,
        format: usedFormat,
        quality: 0.92,
        maxWidth: Number(size) || Infinity,
        onFrame: (frame) => setFrames((current) => [...current, { ...frame, format: usedFormat }]),
        onProgress: setProgress,
        cancelled: () => stop.current,
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(false);
    }
  };

  const chosen = frames.filter((frame) => !unselected.has(frame.id));
  const toggle = (id) =>
    setUnselected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <Choice label="Take a picture" value={mode} onChange={setMode} options={MODES} disabled={running} />
        <div className="flex gap-2.5">
          {mode === "interval" && (
            <NumberField label="Every" value={every} onChange={setEvery} min={0.1} max={600} step={0.5} suffix="sec" disabled={running} />
          )}
          {mode === "count" && (
            <NumberField label="How many" value={count} onChange={setCount} min={1} max={MAX_FRAMES} suffix="images" disabled={running} />
          )}
          {mode === "scenes" && (
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-2xs font-medium text-ink-3">
                Sensitivity · {sensitivity < 0.34 ? "big cuts only" : sensitivity > 0.66 ? "small changes too" : "normal"}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sensitivity}
                disabled={running}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                className="h-10 w-full accent-ink"
              />
            </label>
          )}
          <Select
            label="Format"
            value={format}
            onChange={setFormat}
            options={FRAME_FORMATS.map((item) => [item.value, item.label])}
            disabled={running}
            className="max-w-28"
          />
        </div>
        <Select label="Image size" value={size} onChange={setSize} options={SIZES} disabled={running} />
        <RunButton
          running={running}
          progress={progress}
          detail={`Grabbing frames… ${plural(frames.length, "image")} so far`}
          onStart={start}
          onStop={() => (stop.current = true)}
          label={estimate ? `Extract ${plural(estimate, "image")}` : "Find scene changes"}
        />
      </div>

      {frames.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-semibold">
              {plural(frames.length, "image")}
              {unselected.size > 0 && <span className="font-normal text-ink-3"> · {chosen.length} selected</span>}
            </p>
            <SmallButton
              onClick={() => setUnselected(unselected.size ? new Set() : new Set(frames.map((frame) => frame.id)))}
              disabled={running}
            >
              {unselected.size ? "Select all" : "Select none"}
            </SmallButton>
            <SmallButton onClick={clear} disabled={running}>
              <Trash2 />
              Clear
            </SmallButton>
            <button
              type="button"
              disabled={!chosen.length || running}
              onClick={() =>
                downloadZip(
                  chosen.map((frame) => ({ name: frameName(file, frame, frame.format), blob: frame.blob })),
                  `${baseName(file.name)}-frames.zip`,
                )
              }
              className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-ground hover:bg-ink/85 disabled:opacity-50"
            >
              <FileArchive className="size-[1.5rem]" />
              Download {chosen.length} as .zip
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {frames.map((frame) => {
              const on = !unselected.has(frame.id);
              return (
                <li key={frame.id} className="group relative animate-pop">
                  <button
                    type="button"
                    onClick={() => toggle(frame.id)}
                    className={cn(
                      "block w-full overflow-hidden rounded-xl bg-sunken ring-offset-2 ring-offset-ground transition",
                      on ? "ring-2 ring-ink" : "opacity-45",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frame.url} alt={`Frame at ${fmtTime(frame.time)}`} className="aspect-video w-full object-contain" />
                  </button>
                  <span
                    className={cn(
                      "pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2 border-white shadow-card",
                      on ? "bg-ink text-ground" : "bg-black/30",
                    )}
                  >
                    {on && <Check className="size-[1.3rem]" strokeWidth={3} />}
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSeek(frame.time)}
                      className="rounded px-1 text-xs font-medium text-ink-2 tabular-nums hover:bg-hover"
                      title="Show in the player"
                    >
                      {fmtTime(frame.time, true)}
                    </button>
                    <button
                      type="button"
                      aria-label="Download this image"
                      onClick={() => downloadBlob(frame.blob, frameName(file, frame, frame.format))}
                      className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
                    >
                      <Download className="size-[1.4rem]" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
