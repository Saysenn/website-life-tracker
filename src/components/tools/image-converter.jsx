"use client";

import { ArrowRight, ChevronDown, Download, FileArchive, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { useFileQueue } from "@/hooks/use-file-queue";
import { INPUT_FORMATS, OUTPUT_FORMATS, convertImage, inputFormat, outputFormat } from "@/lib/tools/convert-image";
import { downloadBlob, downloadZip } from "@/lib/tools/files";
import { cn, plural } from "@/lib/utils";
import { DropZone } from "./drop-zone";
import { FileRow } from "./file-row";
import { BigButton, QueueSummary } from "./queue-summary";
import { ToolHeader } from "./tool-header";

const POPULAR = [
  ["png", "webp"],
  ["jpg", "webp"],
  ["webp", "png"],
  ["webp", "jpg"],
  ["png", "jpg"],
  ["jpg", "png"],
  ["svg", "png"],
  ["heic", "jpg"],
  ["avif", "png"],
  ["gif", "png"],
];

const STEPS = [
  { title: "Upload images", body: "Tap Choose files or drop images in. Add as many as you like." },
  { title: "Start conversion", body: "Pick the output format, adjust quality in Settings, then convert." },
  { title: "Download", body: "Save each image on its own, or grab them all in one .zip." },
];

function FormatSelect({ label, value, options, onChange, disabled }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-xl bg-sunken pr-9 pl-3.5 text-base font-semibold text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ink/15 disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-[1.6rem] -translate-y-1/2 text-ink-3" />
      </span>
    </label>
  );
}

const statusLabel = (item) =>
  ({ queued: "Ready", working: "Converting", done: "Done", error: "Failed" })[item.status];

export function ImageConverter({ initialFrom, initialTo }) {
  const { items, add, start, remove, clear, requeue, stats } = useFileQueue(convertImage, { previews: true });
  const [from, setFrom] = useState(inputFormat(initialFrom).value);
  const [to, setTo] = useState(outputFormat(initialTo).value);
  const [quality, setQuality] = useState(90);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const source = inputFormat(from);
  const target = outputFormat(to);
  const working = stats.busy;
  const finished = items.filter((item) => item.status === "done");
  const before = finished.reduce((sum, item) => sum + item.file.size, 0);
  const after = finished.reduce((sum, item) => sum + item.result.blob.size, 0);

  const syncUrl = (nextFrom, nextTo) =>
    window.history.replaceState(null, "", `?from=${nextFrom}&to=${nextTo}`);

  const changeFormats = (nextFrom, nextTo) => {
    setFrom(nextFrom);
    setTo(nextTo);
    syncUrl(nextFrom, nextTo);
    if (nextTo !== to) requeue();
  };

  const changeQuality = (value) => {
    setQuality(value);
    requeue();
  };

  const convert = () => start({ format: to, quality: quality / 100 });

  const downloadAll = async () => {
    if (finished.length === 1) return downloadBlob(finished[0].result.blob, finished[0].result.name);
    setZipping(true);
    try {
      await downloadZip(finished.map((item) => item.result), `converted-${target.value}-${finished.length}.zip`);
    } catch {
      toast.error("Couldn't build the zip");
    } finally {
      setZipping(false);
    }
  };

  const allDone = stats.total > 0 && stats.queued === 0 && !working;
  const action = allDone ? (
    <BigButton onClick={downloadAll} disabled={!finished.length || zipping}>
      {finished.length > 1 ? <FileArchive /> : <Download />}
      {finished.length > 1 ? `Download all (${finished.length})` : `Download ${target.label}`}
    </BigButton>
  ) : (
    <BigButton onClick={convert} disabled={working || stats.queued === 0}>
      <RefreshCw className={cn(working && "animate-spin")} />
      {working ? "Converting…" : `Start conversion (${stats.queued})`}
    </BigButton>
  );

  return (
    <Page className="max-w-[76rem]">
      <ToolHeader
        icon="image"
        title={`${source.label} to ${target.label} Converter`}
        description={`Convert ${source.value === "image" ? "any image" : `${source.label} images`} to ${target.label} in bulk — fast, free and private.`}
      />

      <section className="mt-5 rounded-2xl bg-surface p-3 shadow-card sm:p-4">
        <div className="flex items-end gap-2">
          <FormatSelect
            label="Convert"
            value={from}
            options={INPUT_FORMATS}
            onChange={(value) => changeFormats(value, to)}
            disabled={working}
          />
          <ArrowRight className="mb-3.5 size-[1.6rem] shrink-0 text-ink-4" />
          <FormatSelect
            label="To"
            value={to}
            options={OUTPUT_FORMATS}
            onChange={(value) => changeFormats(from, value)}
            disabled={working}
          />
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-label="Settings"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2 transition-colors hover:bg-hover",
              settingsOpen && "bg-ink text-ground hover:bg-ink/85",
            )}
          >
            <SlidersHorizontal className="size-[1.7rem]" />
          </button>
        </div>

        {settingsOpen && (
          <div className="mt-3 animate-pop rounded-xl bg-sunken p-3.5">
            {target.lossy ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Quality</span>
                  <span className="font-semibold tabular-nums">{quality}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  disabled={working}
                  onChange={(event) => changeQuality(Number(event.target.value))}
                  className="mt-2 h-6 w-full accent-ink"
                />
                <p className="mt-1 text-xs text-ink-3">100 keeps the most detail. 75–90 is a good balance for the web.</p>
              </>
            ) : (
              <p className="text-xs text-ink-3">PNG is lossless — there&apos;s no quality setting. Transparency is kept.</p>
            )}
            {target.value === "jpg" && (
              <p className="mt-2 text-xs text-ink-3">JPG has no transparency, so see-through areas become white.</p>
            )}
          </div>
        )}

        <div className="mt-3">
          {items.length === 0 ? (
            <DropZone
              onFiles={add}
              accept={source.accept}
              title="Choose files"
              hint="or drop your images here"
              note={source.value === "heic" ? "HEIC opens in Safari only" : "Any amount · stays on your device"}
            />
          ) : (
            <DropZone onFiles={add} accept={source.accept} compact />
          )}
        </div>
      </section>

      {items.length > 0 && (
        <div className="mt-3 flex flex-col">
          <QueueSummary
            stats={stats}
            title={
              working
                ? `Converting ${Math.min(stats.done + stats.failed + 1, stats.total)} of ${stats.total}…`
                : allDone
                  ? `${plural(finished.length, "image")} converted to ${target.label}`
                  : `${plural(stats.queued, "image")} ready to convert`
            }
            subtitle={
              finished.length && before
                ? [
                    `${Math.round(Math.abs(1 - after / before) * 100)}% ${after <= before ? "smaller" : "larger"} overall`,
                    stats.failed ? `${stats.failed} failed` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `Output: ${target.label}${target.lossy ? ` · quality ${quality}` : ""}`
            }
            onClear={clear}
            action={action}
          />

          <ul className="order-first grid gap-2 sm:order-none">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                thumb={item.preview}
                statusLabel={statusLabel(item)}
                downloadLabel={`Download ${(item.result?.format ?? to).toUpperCase()}`}
                onDownload={() => downloadBlob(item.result.blob, item.result.name)}
                onRemove={() => remove(item.id)}
                details={
                  item.result && (
                    <p className="mt-2 text-xs text-ink-3 tabular-nums">
                      {item.result.width} × {item.result.height}px · {item.result.name}
                    </p>
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold">How to convert {source.label} to {target.label}</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl bg-surface p-4 shadow-card">
              <span className="flex size-7 items-center justify-center rounded-full bg-data-soft text-xs font-semibold text-data">
                {index + 1}
              </span>
              <p className="mt-2.5 text-sm font-semibold">{step.title}</p>
              <p className="mt-0.5 text-xs text-ink-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Popular conversions</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {POPULAR.map(([a, b]) => {
            const active = a === from && b === to;
            return (
              <button
                key={`${a}-${b}`}
                type="button"
                disabled={working}
                onClick={() => changeFormats(a, b)}
                className={cn(
                  "h-8.5 rounded-full bg-surface px-3.5 text-sm font-medium text-ink-2 shadow-card transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50",
                  active && "bg-ink text-ground hover:bg-ink hover:text-ground",
                )}
              >
                {inputFormat(a).label} to {outputFormat(b).label}
              </button>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
