"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  Italic,
  Minus,
  Plus,
  RotateCcw,
  SendToBack,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { FONTS } from "@/lib/tools/pdf/fonts";
import { cn } from "@/lib/utils";

const SWATCHES = ["#000000", "#ffffff", "#1d3f9a", "#b42318", "#1f7a3a", "#ffe066", "#f97316", "#7c3aed"];
const GROUPS = [...new Set(FONTS.map((font) => font.group))];

function IconToggle({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover [&_svg]:size-[1.6rem]",
        active && "bg-ink text-ground hover:bg-ink",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-1", className)}>
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function ColourPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {SWATCHES.map((colour) => (
        <button
          key={colour}
          type="button"
          aria-label={colour}
          onClick={() => onChange(colour)}
          className={cn(
            "size-6 shrink-0 rounded-full border border-ink/15 ring-offset-1 ring-offset-surface",
            value?.toLowerCase() === colour && "ring-2 ring-ink",
          )}
          style={{ background: colour }}
        />
      ))}
      <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-ink/15 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]">
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Custom colour"
        />
      </label>
    </div>
  );
}

function Opacity({ value, onChange }) {
  return (
    <Field label={`Opacity ${Math.round(value * 100)}%`}>
      <input
        type="range"
        min={10}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-6 w-32 accent-ink"
      />
    </Field>
  );
}

export function Properties({ object, onChange, onTextStyle, onDuplicate, onDelete, onLayer, onRemoveBackground, onRestore }) {
  const set = (patch) => onChange(object.id, patch);

  return (
    <div className="flex items-end gap-4 overflow-x-auto px-3 py-2.5 lg:flex-col lg:items-stretch lg:gap-4 lg:overflow-visible lg:p-4">
      <p className="hidden text-sm font-semibold lg:block">
        {object.type === "text"
          ? object.sourceLine
            ? "Edited text"
            : "Text"
          : object.type === "image"
            ? "Image"
            : { whiteout: "Whiteout", highlight: "Highlight", rect: "Box", ellipse: "Circle" }[object.kind]}
      </p>

      {object.type === "text" && (
        <>
          <Field label="Font" className="min-w-44">
            <select
              value={object.font}
              onChange={(event) => onTextStyle(object, { font: event.target.value })}
              className="h-9 rounded-lg bg-sunken px-2.5 text-sm font-medium outline-none"
            >
              {GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {FONTS.filter((font) => font.group === group).map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Size">
            <div className="flex h-9 items-center rounded-lg bg-sunken">
              <button
                type="button"
                aria-label="Smaller"
                onClick={() => onTextStyle(object, { size: Math.max(2, Math.round(object.size - 1)) })}
                className="flex size-9 items-center justify-center text-ink-2 hover:text-ink"
              >
                <Minus className="size-[1.4rem]" />
              </button>
              <input
                type="number"
                min={2}
                max={400}
                step={0.5}
                value={Math.round(object.size * 10) / 10}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  if (size >= 2 && size <= 400) onTextStyle(object, { size });
                }}
                className="w-12 bg-transparent text-center text-sm font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Bigger"
                onClick={() => onTextStyle(object, { size: Math.round(object.size + 1) })}
                className="flex size-9 items-center justify-center text-ink-2 hover:text-ink"
              >
                <Plus className="size-[1.4rem]" />
              </button>
            </div>
          </Field>

          <Field label="Style">
            <div className="flex gap-0.5">
              <IconToggle label="Bold" active={object.bold} onClick={() => onTextStyle(object, { bold: !object.bold })}>
                <Bold />
              </IconToggle>
              <IconToggle label="Italic" active={object.italic} onClick={() => onTextStyle(object, { italic: !object.italic })}>
                <Italic />
              </IconToggle>
              <span className="mx-1 w-px bg-grid" />
              {[
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ].map(([align, Icon]) => (
                <IconToggle key={align} label={`Align ${align}`} active={object.align === align} onClick={() => set({ align })}>
                  <Icon />
                </IconToggle>
              ))}
            </div>
          </Field>

          <Field label="Colour">
            <ColourPicker value={object.color} onChange={(color) => set({ color })} />
          </Field>

          {object.cover && (
            <Field label="Patch behind text">
              <ColourPicker value={object.cover.color} onChange={(color) => set({ cover: { ...object.cover, color } })} />
            </Field>
          )}
        </>
      )}

      {object.type === "image" && (
        <Field label="Background">
          <button
            type="button"
            onClick={() => onRemoveBackground(object)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sunken px-3 text-sm font-medium transition-colors hover:bg-hover"
          >
            <WandSparkles className="size-[1.5rem]" />
            Remove background
          </button>
        </Field>
      )}

      {object.type === "shape" && (
        <>
          <Field label={object.kind === "rect" || object.kind === "ellipse" ? "Border" : "Colour"}>
            <ColourPicker
              value={object.kind === "whiteout" ? object.fill : object.color}
              onChange={(color) => set(object.kind === "whiteout" ? { fill: color } : { color })}
            />
          </Field>
          {(object.kind === "rect" || object.kind === "ellipse") && (
            <>
              <Field label={`Border width ${object.strokeWidth}`}>
                <input
                  type="range"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={object.strokeWidth}
                  onChange={(event) => set({ strokeWidth: Number(event.target.value) })}
                  className="h-6 w-32 accent-ink"
                />
              </Field>
              <Field label="Fill">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => set({ fill: null })}
                    className={cn(
                      "h-6 rounded-full border border-ink/15 px-2 text-2xs font-medium",
                      !object.fill && "ring-2 ring-ink ring-offset-1",
                    )}
                  >
                    None
                  </button>
                  <ColourPicker value={object.fill} onChange={(fill) => set({ fill })} />
                </div>
              </Field>
            </>
          )}
        </>
      )}

      {object.kind !== "whiteout" && <Opacity value={object.opacity ?? 1} onChange={(opacity) => set({ opacity })} />}

      <Field label="Arrange">
        <div className="flex gap-0.5">
          <IconToggle label="Bring to front" onClick={() => onLayer(object.id, 1)}>
            <BringToFront />
          </IconToggle>
          <IconToggle label="Send to back" onClick={() => onLayer(object.id, -1)}>
            <SendToBack />
          </IconToggle>
          <IconToggle label="Duplicate" onClick={() => onDuplicate(object.id)}>
            <Copy />
          </IconToggle>
          {object.sourceLine && (
            <IconToggle label="Restore original text" onClick={() => onRestore(object.id)}>
              <RotateCcw />
            </IconToggle>
          )}
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={() => onDelete(object.id)}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger-soft"
          >
            <Trash2 className="size-[1.6rem]" />
          </button>
        </div>
      </Field>
    </div>
  );
}
