"use client";

import { Heart, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "@/lib/tools/files";
import { storageUsage } from "@/lib/tools/media-store";
import { CAM_SCALES, RING_GRADIENT } from "@/lib/tools/screen/capture";
import { cn } from "@/lib/utils";
import { SaveLocation } from "../save-location";
import { Choice, NumberField, Select } from "../video/controls";
import { BubblePreview } from "./bubble-preview";

/** Segmented controls are sized for a mouse; on a touch screen give each option a finger-sized height. */
export const TOUCH_SEGMENTS = "[&>button]:pointer-coarse:h-10";

/** One setting: label and hint on the left, control on the right (or below when `stack`). */
export function Row({ label, hint, children, stack = false, disabled = false }) {
  return (
    <div className={cn("flex gap-x-3 gap-y-2 py-3", stack ? "flex-col" : "flex-wrap items-center", disabled && "opacity-50")}>
      {/* The label keeps a readable width; a wide control (slider, choice) wraps under it on a phone. */}
      <div className={cn("min-w-0 flex-1", !stack && "basis-44")}>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Group({ title, children }) {
  return (
    <section className="px-1">
      {title && <h3 className="pt-3 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{title}</h3>}
      <div className="divide-y divide-grid">{children}</div>
    </section>
  );
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, format = (v) => `${Math.round(v * 100)}%`, disabled }) {
  return (
    <label className="flex w-full items-center gap-3 sm:w-64">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-ink disabled:cursor-default"
      />
      <span className="w-11 text-right text-xs font-semibold text-ink-2 tabular-nums">{format(value)}</span>
    </label>
  );
}

/** A live level meter that reads a 0–1 value every animation frame. */
export function Meter({ read, active }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame;
    const loop = () => {
      setLevel(read());
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      setLevel(0);
    };
  }, [read, active]);
  return (
    <div className="flex h-2 w-full gap-[2px] sm:w-64" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => {
        const on = level * 24 > i;
        return <span key={i} className={cn("flex-1 rounded-[1px] transition-colors duration-75", on ? (i > 20 ? "bg-danger" : i > 16 ? "bg-amber" : "bg-good") : "bg-hover")} />;
      })}
    </div>
  );
}

const CORNERS = [
  ["top-left", "Top left"],
  ["top-right", "Top right"],
  ["bottom-left", "Bottom left"],
  ["bottom-right", "Bottom right"],
];

export function CornerPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Position" className="grid size-16 shrink-0 grid-cols-2 gap-1 rounded-lg bg-hover p-1">
      {CORNERS.map(([corner, label]) => (
        <button
          key={corner}
          type="button"
          role="radio"
          aria-checked={value === corner}
          title={label}
          onClick={() => onChange(corner)}
          className={cn("rounded-[0.4rem] transition-colors", value === corner ? "bg-ink" : "bg-surface hover:bg-selected")}
        />
      ))}
    </div>
  );
}

const SIZES = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
];

export function VideoPanel({ cfg, set, support, locked }) {
  return (
    <div className="flex flex-col gap-3">
      <Group title="Format">
        <div className="grid gap-3 py-3 sm:grid-cols-2">
          <Choice
            label="File type"
            value={cfg.format}
            onChange={(format) => set({ format })}
            disabled={locked}
            options={[
              { value: "mp4", label: "MP4", note: support.mp4 ? "Plays everywhere" : "Not in this browser" },
              { value: "webm", label: "WebM", note: support.webm ? "Smaller files" : "Not in this browser" },
            ]}
          />
          <Choice
            label="Quality"
            value={cfg.quality}
            onChange={(quality) => set({ quality })}
            disabled={locked}
            options={[
              { value: "standard", label: "Standard", note: "Small" },
              { value: "high", label: "High", note: "Balanced" },
              { value: "max", label: "Max", note: "Large" },
            ]}
          />
          <Select
            label="Resolution"
            value={cfg.resolution}
            onChange={(resolution) => set({ resolution })}
            disabled={locked}
            options={[
              ["original", "Original size"],
              ["2160", "Up to 4K (2160p)"],
              ["1440", "Up to 1440p"],
              ["1080", "Up to 1080p"],
              ["720", "Up to 720p"],
              ["480", "Up to 480p"],
            ]}
          />
          <Choice
            label="Frames per second"
            value={cfg.fps}
            onChange={(fps) => set({ fps })}
            disabled={locked}
            options={[15, 24, 30, 60].map((fps) => ({ value: fps, label: String(fps) }))}
          />
        </div>
      </Group>
      <Group title="Start & stop">
        <Row label="Countdown" hint="A few seconds to get ready before recording starts.">
          <div className="w-full sm:w-64">
            <Choice
              value={cfg.countdown}
              onChange={(countdown) => set({ countdown })}
              options={[0, 3, 5, 10].map((n) => ({ value: n, label: n ? `${n}s` : "Off" }))}
            />
          </div>
        </Row>
        <Row label="Stop automatically" hint="End the recording after a set time or file size.">
          <div className="flex w-full flex-col gap-2 sm:w-64">
            <Choice
              value={cfg.autoStop}
              onChange={(autoStop) => set({ autoStop })}
              options={[
                { value: "off", label: "Off" },
                { value: "time", label: "Time" },
                { value: "size", label: "Size" },
              ]}
            />
            {cfg.autoStop === "time" && (
              <NumberField label="After" value={cfg.autoStopMinutes} onChange={(autoStopMinutes) => set({ autoStopMinutes })} min={1} max={600} suffix="min" />
            )}
            {cfg.autoStop === "size" && (
              <NumberField label="At" value={cfg.autoStopMb} onChange={(autoStopMb) => set({ autoStopMb })} min={10} max={20000} step={10} suffix="MB" />
            )}
          </div>
        </Row>
      </Group>
    </div>
  );
}

export function AudioPanel({ cfg, set, devices, onAllow, level, live, locked }) {
  return (
    <div className="flex flex-col gap-3">
      <Group title="Computer sound">
        <Row label="Record computer sound" hint="Sound from the tab or screen you share. Tick “Share audio” in the browser's picker. Whole-screen sound works on Windows and ChromeOS; on a Mac, share a tab.">
          <Switch checked={cfg.systemAudio} onCheckedChange={(systemAudio) => set({ systemAudio })} disabled={locked} />
        </Row>
        <Row label="Volume" stack disabled={!cfg.systemAudio}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Slider label="Computer volume" value={cfg.systemGain} max={2} onChange={(systemGain) => set({ systemGain })} disabled={!cfg.systemAudio} />
            <Meter read={() => level("system")} active={live && cfg.systemAudio} />
          </div>
        </Row>
      </Group>
      <Group title="Microphone">
        <Row label="Record microphone" hint="Your voice, mixed in with the computer sound. You can mute it mid-recording.">
          <Switch checked={cfg.mic} onCheckedChange={(mic) => set({ mic })} />
        </Row>
        <Row label="Device" stack disabled={!cfg.mic}>
          <div className="flex items-end gap-2">
            <Select
              label="Microphone"
              value={cfg.micId}
              onChange={(micId) => set({ micId })}
              disabled={!cfg.mic || locked}
              options={[["", "System default"], ...devices.mics.map((mic) => [mic.id, mic.label])]}
            />
            {devices.mics.every((mic) => mic.label.startsWith("Microphone ")) && (
              <button type="button" onClick={onAllow} className="h-10 shrink-0 rounded-xl bg-hover px-3 text-xs font-semibold hover:bg-selected">
                Show names
              </button>
            )}
          </div>
        </Row>
        <Row label="Volume" stack disabled={!cfg.mic}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Slider label="Microphone volume" value={cfg.micGain} max={2} onChange={(micGain) => set({ micGain })} disabled={!cfg.mic} />
            <Meter read={() => level("mic")} active={live && cfg.mic} />
          </div>
        </Row>
        <Row label="Reduce background noise" hint="Uses the browser's built-in noise and echo suppression on the mic. For a deeper clean, use the Voice recorder tool.">
          <Switch checked={cfg.micClean} onCheckedChange={(micClean) => set({ micClean })} disabled={!cfg.mic || locked} />
        </Row>
      </Group>
    </div>
  );
}

const POSITIONS = [
  ["top-left", "Top left"],
  ["top-center", "Top centre"],
  ["top-right", "Top right"],
  ["middle-left", "Middle left"],
  null,
  ["middle-right", "Middle right"],
  ["bottom-left", "Bottom left"],
  ["bottom-center", "Bottom centre"],
  ["bottom-right", "Bottom right"],
];

/** Eight places around the edge of the picture. */
export function PositionPicker({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="Position" className="grid size-20 shrink-0 grid-cols-3 gap-1 rounded-lg bg-hover p-1">
      {POSITIONS.map((entry, i) =>
        entry ? (
          <button
            key={entry[0]}
            type="button"
            role="radio"
            aria-checked={value === entry[0]}
            title={entry[1]}
            disabled={disabled}
            onClick={() => onChange(entry[0])}
            className={cn("rounded-[0.4rem] transition-colors", value === entry[0] ? "bg-ink" : "bg-surface hover:bg-selected")}
          />
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  );
}

const SIZE_PRESETS = [
  { value: "xs", label: "Tiny" },
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
  { value: "xl", label: "Huge" },
];

const SHAPES = [
  { value: "circle", label: "Circle", swatch: "aspect-square rounded-full" },
  { value: "rounded", label: "Rounded", swatch: "aspect-square rounded-[30%]" },
  { value: "square", label: "Square", swatch: "aspect-square rounded-[0.2rem]" },
  { value: "wide", label: "Wide", swatch: "aspect-video rounded-[0.3rem]" },
  { value: "tall", label: "Tall", swatch: "aspect-[3/4] h-full rounded-[0.3rem]" },
  { value: "hexagon", label: "Hexagon", swatch: "aspect-square [clip-path:polygon(50%_0,93%_25%,93%_75%,50%_100%,7%_75%,7%_25%)]" },
  { value: "heart", label: "Heart" },
];

const FILTERS = [
  { value: "none", label: "Natural" },
  { value: "bw", label: "B&W" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "vivid", label: "Vivid" },
  { value: "soft", label: "Soft" },
];

const RING_COLORS = ["#ffffff", "#1e1b16", "#a63f2a", "#e0892b", "#f2c94c", "#4f8a3c", "#2f6fd6", "#7a4fd6", "#e0559b"];

/** Which preset a fine-tuned size is closest to, so the preset buttons still light up. */
const nearestPreset = (scale) =>
  Object.entries(CAM_SCALES).reduce((best, [key, value]) => (Math.abs(value - scale) < Math.abs(CAM_SCALES[best] - scale) ? key : best), "m");

export function WebcamPanel({ cfg, set, devices, onAllow, locked, live, liveCamera }) {
  const off = !cfg.cam && cfg.mode !== "webcam";
  const designOff = !cfg.cam;
  const scale = cfg.camScale;
  const preset = Object.entries(CAM_SCALES).find(([, value]) => Math.abs(value - scale) < 0.001)?.[0];
  return (
    <div className="flex flex-col gap-3">
      <Group>
        <Row
          label="Webcam overlay"
          hint={
            live && liveCamera
              ? "Turn it off and on to hide or show your face mid-recording. Every design change below shows up in the recording right away."
              : "Puts your camera on top of screen, window, tab and area recordings."
          }
        >
          <Switch checked={cfg.cam} onCheckedChange={(cam) => set({ cam })} disabled={locked && !liveCamera} />
        </Row>
        <Row label="Camera" stack disabled={off}>
          <div className="flex items-end gap-2">
            <Select
              label="Device"
              value={cfg.camId}
              onChange={(camId) => set({ camId })}
              disabled={locked}
              options={[["", "System default"], ...devices.cameras.map((cam) => [cam.id, cam.label])]}
            />
            {devices.cameras.every((cam) => cam.label.startsWith("Camera ")) && (
              <button type="button" onClick={onAllow} className="h-10 shrink-0 rounded-xl bg-hover px-3 text-xs font-semibold hover:bg-selected">
                Show names
              </button>
            )}
          </div>
        </Row>
      </Group>

      <BubblePreview cfg={cfg} enabled={!designOff} />

      <Group title="Size & place">
        <Row label="Size" stack disabled={designOff}>
          <div className="flex flex-col gap-2">
            <Choice value={preset ?? nearestPreset(scale)} onChange={(key) => set({ camScale: CAM_SCALES[key] })} options={SIZE_PRESETS} disabled={designOff} />
            <Slider label="Exact size" value={scale} min={0.05} max={0.45} step={0.005} onChange={(camScale) => set({ camScale })} disabled={designOff} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </Row>
        <Row label="Position" hint="Where the bubble sits on the picture." disabled={designOff}>
          <PositionPicker value={cfg.camPosition} onChange={(camPosition) => set({ camPosition })} disabled={designOff} />
        </Row>
        <Row label="Zoom" hint="Fill a small bubble with your face instead of the room." disabled={designOff}>
          <Slider label="Zoom" value={cfg.camZoom} min={1} max={2.5} step={0.05} onChange={(camZoom) => set({ camZoom })} disabled={designOff} format={(v) => `${v.toFixed(1)}×`} />
        </Row>
      </Group>

      <Group title="Shape">
        <div role="radiogroup" aria-label="Shape" className="grid grid-cols-4 gap-1.5 py-3 sm:grid-cols-7">
          {SHAPES.map((shape) => {
            const active = (cfg.camShape === "rect" ? "wide" : cfg.camShape) === shape.value;
            return (
              <button
                key={shape.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={designOff}
                onClick={() => set({ camShape: shape.value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50",
                  active ? "bg-surface text-ink shadow-card" : "bg-sunken",
                )}
              >
                <span className="flex h-7 w-10 items-center justify-center">
                  {shape.swatch ? <span className={cn("block max-h-full max-w-full bg-current", shape.swatch, shape.value === "wide" ? "w-full" : "h-full")} /> : <Heart className="size-[2.6rem] fill-current" strokeWidth={0} />}
                </span>
                {shape.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Design">
        <Row label="Ring" hint="An outline around the bubble." stack disabled={designOff}>
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice
                value={cfg.camBorder}
                onChange={(camBorder) => set({ camBorder })}
                disabled={designOff}
                options={[
                  { value: "none", label: "None" },
                  { value: "solid", label: "Colour" },
                  { value: "gradient", label: "Gradient" },
                ]}
              />
              <Choice
                value={cfg.camBorderWidth}
                onChange={(camBorderWidth) => set({ camBorderWidth })}
                disabled={designOff || cfg.camBorder === "none"}
                options={[
                  { value: "thin", label: "Thin" },
                  { value: "thick", label: "Thick" },
                ]}
              />
            </div>
            {cfg.camBorder === "solid" && (
              <div role="radiogroup" aria-label="Ring colour" className="flex flex-wrap items-center gap-1.5">
                {RING_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={cfg.camBorderColor === color}
                    title={color}
                    onClick={() => set({ camBorderColor: color })}
                    className={cn(
                      "size-8 rounded-full shadow-card transition-transform hover:scale-105",
                      cfg.camBorderColor === color && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                    )}
                    style={{ background: color }}
                  />
                ))}
                <label title="Any colour" className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] shadow-card">
                  <span className="sr-only">Any colour</span>
                  <input type="color" value={cfg.camBorderColor} onChange={(event) => set({ camBorderColor: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            )}
            {cfg.camBorder === "gradient" && <span className="h-2 w-full rounded-full sm:w-64" style={{ background: `linear-gradient(90deg, ${RING_GRADIENT.join(", ")})` }} />}
          </div>
        </Row>
        <Row label="Look" stack disabled={designOff}>
          <Choice value={cfg.camFilter} onChange={(camFilter) => set({ camFilter })} options={FILTERS} disabled={designOff} />
        </Row>
        <Row label="Name tag" hint="A small label under the bubble, e.g. your name or role." stack disabled={designOff}>
          <Input value={cfg.camLabel} maxLength={40} placeholder="Leave empty for none" disabled={designOff} onChange={(event) => set({ camLabel: event.target.value })} />
        </Row>
        <Row label="Shadow" hint="A soft shadow so the bubble lifts off the screen." disabled={designOff}>
          <Switch checked={cfg.camShadow} onCheckedChange={(camShadow) => set({ camShadow })} disabled={designOff} />
        </Row>
        <Row label="Mirror" hint="Flip the camera like a mirror." disabled={designOff}>
          <Switch checked={cfg.camMirror} onCheckedChange={(camMirror) => set({ camMirror })} disabled={designOff} />
        </Row>
      </Group>
    </div>
  );
}

export function LogoPanel({ cfg, set, logoUrl, onLogo }) {
  const off = cfg.mark === "off";
  return (
    <Group>
      <Row label="Add a logo or text" hint="Stamps a watermark on every frame. Can be changed while recording.">
        <div className="w-full sm:w-64">
          <Choice
            value={cfg.mark}
            onChange={(mark) => set({ mark })}
            options={[
              { value: "off", label: "Off" },
              { value: "text", label: "Text" },
              { value: "image", label: "Image" },
            ]}
          />
        </div>
      </Row>
      {cfg.mark === "text" && (
        <Row label="Text" stack>
          <Input value={cfg.markText} maxLength={80} placeholder="e.g. your name or website" onChange={(event) => set({ markText: event.target.value })} />
        </Row>
      )}
      {cfg.mark === "image" && (
        <Row label="Image" hint="PNG with a transparent background looks best.">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-10 max-w-28 rounded-md bg-[repeating-conic-gradient(#e8e1d5_0_25%,#fffdfa_0_50%)] bg-[length:1rem_1rem] object-contain" />
          )}
          <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-hover px-3 text-sm font-medium hover:bg-selected">
            <ImagePlus className="size-[1.5rem]" />
            {logoUrl ? "Change" : "Choose image"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onLogo(file);
                event.target.value = "";
              }}
            />
          </label>
          {logoUrl && (
            <button type="button" onClick={() => onLogo(null)} title="Remove image" className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger">
              <Trash2 className="size-[1.5rem]" />
            </button>
          )}
        </Row>
      )}
      <Row label="Position" disabled={off}>
        <CornerPicker value={cfg.markPosition} onChange={(markPosition) => set({ markPosition })} />
      </Row>
      <Row label="Size" disabled={off}>
        <div className="w-full sm:w-64">
          <Choice value={cfg.markSize} onChange={(markSize) => set({ markSize })} options={SIZES} disabled={off} />
        </div>
      </Row>
      <Row label="Opacity" disabled={off}>
        <Slider label="Opacity" value={cfg.markOpacity} min={0.1} max={1} onChange={(markOpacity) => set({ markOpacity })} disabled={off} />
      </Row>
    </Group>
  );
}

export function OutputPanel({ cfg, set, folder, count }) {
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    storageUsage().then(setUsage);
  }, [count]);

  return (
    <div className="flex flex-col gap-3">
      <Group title="Where recordings go">
        <SaveLocation value={cfg.saveTo} onChange={(saveTo) => set({ saveTo })} folder={folder} what="recordings" />
        {cfg.saveTo === "folder" && (
          <p className="pb-3 text-xs text-ink-3">Recordings stream into the folder while you record, so even long ones don&apos;t fill up memory.</p>
        )}
        <Row label="File name" hint={`Files are named like “${cfg.prefix || "Recording"} 2026-11-21 14-05-09.mp4”.`} stack>
          <Input value={cfg.prefix} maxLength={40} placeholder="Recording" onChange={(event) => set({ prefix: event.target.value.replace(/[\\/:*?"<>|]/g, "") })} />
        </Row>
      </Group>
      <Group title="Kept on this device">
        <Row label="Browser storage used" hint="Every recording is also listed below, so you can play, download or delete it from here.">
          <span className="text-sm font-semibold tabular-nums">{usage ? `${formatBytes(usage.usage)} of ${formatBytes(usage.quota)}` : "—"}</span>
        </Row>
      </Group>
    </div>
  );
}

export const HOTKEYS = [
  ["Alt", "R", "Start / stop recording"],
  ["Alt", "P", "Pause / resume"],
  ["Alt", "M", "Mute / unmute microphone"],
];

export function HotkeysPanel({ cfg, set, isMac }) {
  return (
    <Group>
      <Row label="Keyboard shortcuts" hint="Work while this page or the floating bar is focused. For shortcuts in every tab, add the extension under Launch.">
        <Switch checked={cfg.hotkeys} onCheckedChange={(hotkeys) => set({ hotkeys })} />
      </Row>
      {HOTKEYS.map(([mod, key, label]) => (
        <Row key={key} label={label} disabled={!cfg.hotkeys}>
          <span className="flex gap-1">
            {[isMac ? "⌥ Option" : mod, key].map((part) => (
              <kbd key={part} className="rounded-md bg-surface px-2 py-1 font-sans text-xs font-semibold shadow-card">
                {part}
              </kbd>
            ))}
          </span>
        </Row>
      ))}
      <Row label="Floating control bar" hint="When you press REC, a small always-on-top window opens with the timer, mic, webcam, pause and stop — plus the tutorial tools and a live pad to click and draw on when Tutorial mode is on. It stays on screen while you switch tabs or apps (Chrome and Edge).">
        <Switch checked={cfg.miniBar} onCheckedChange={(miniBar) => set({ miniBar })} />
      </Row>
    </Group>
  );
}
