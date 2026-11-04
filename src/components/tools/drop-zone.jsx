"use client";

import { CloudUpload, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function DropZone({ onFiles, onText, accept, title = "Choose files", hint, note, compact = false, className }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const take = (files) => {
    if (files?.length) onFiles(files);
  };

  const dragProps = {
    onDragOver: (event) => {
      event.preventDefault();
      setOver(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOver(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      setOver(false);
      if (event.dataTransfer.files?.length) return take(event.dataTransfer.files);
      // A link dragged in from another tab arrives as text, not a file.
      const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
      if (text && onText) onText(text.trim());
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      accept={accept}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        take(event.target.files);
        event.target.value = "";
      }}
    />
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => input.current?.click()}
        {...dragProps}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink-4/70 text-sm font-medium text-ink-2 transition-colors hover:border-ink-3 hover:bg-sunken",
          over && "border-data bg-data-soft text-data",
          className,
        )}
      >
        <Plus className="size-[1.5rem]" />
        Add more files
        {picker}
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.current?.click();
        }
      }}
      {...dragProps}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-4/70 bg-sunken/60 px-5 py-10 text-center transition-colors hover:border-ink-3 hover:bg-sunken sm:py-14",
        over && "border-data bg-data-soft",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-13 items-center justify-center rounded-2xl bg-surface text-ink-2 shadow-card transition-transform",
          over && "scale-110 text-data",
        )}
      >
        <CloudUpload className="size-[2.4rem]" strokeWidth={1.75} />
      </span>
      <span className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-5 text-base font-semibold text-ground shadow-card">
        {title}
      </span>
      <p className="mt-2.5 text-sm text-ink-2">{over ? "Drop to add them" : hint}</p>
      {note && <p className="mt-1 text-xs text-ink-4">{note}</p>}
      {picker}
    </div>
  );
}

export function ProgressBar({ value, tone = "ink", className }) {
  const tones = { ink: "bg-ink", success: "bg-success", danger: "bg-danger", data: "bg-data" };
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-hover", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-200 ease-out", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
