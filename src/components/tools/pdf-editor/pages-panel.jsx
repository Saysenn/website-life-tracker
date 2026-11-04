"use client";

import { ArrowDown, ArrowUp, Copy, FilePlus2, FileUp, RotateCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { renderThumbnail } from "@/lib/tools/pdf/pdfjs";
import { cn } from "@/lib/utils";

const thumbnails = new Map();

function Thumbnail({ entry, pdf }) {
  const key = `${entry.source}:${entry.index}`;
  const [src, setSrc] = useState(() => thumbnails.get(key) ?? null);

  useEffect(() => {
    if (src || entry.index === null || !pdf) return;
    let cancelled = false;
    renderThumbnail(pdf, entry.index).then((url) => {
      thumbnails.set(key, url);
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, key, pdf, entry.index]);

  const sideways = entry.rotation % 180 !== 0;
  const ratio = sideways ? entry.width / entry.height : entry.height / entry.width;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-white shadow-card" style={{ aspectRatio: `1 / ${ratio}` }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute top-1/2 left-1/2 max-w-none"
          style={{
            width: sideways ? `${(entry.width / entry.height) * 100}%` : "100%",
            transform: `translate(-50%, -50%) rotate(${entry.rotation}deg)`,
          }}
        />
      )}
    </div>
  );
}

function SmallButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 [&_svg]:size-[1.5rem]",
        danger && "hover:bg-danger-soft hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

export function PagesPanel({ open, onOpenChange, pages, sources, actions }) {
  const fileInput = useRef(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pages" className="max-w-[44rem]">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-grid px-4">
        <p className="flex-1 text-base font-semibold">
          Pages <span className="text-sm font-normal text-ink-3 tabular-nums">{pages.length}</span>
        </p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-hover"
        >
          <X className="size-[1.7rem]" />
        </button>
      </div>

      <div className="flex gap-2 border-b border-grid px-4 py-3">
        <button
          type="button"
          onClick={() => actions.addBlank(pages.length)}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sunken text-sm font-medium hover:bg-hover"
        >
          <FilePlus2 className="size-[1.5rem]" />
          Blank page
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sunken text-sm font-medium hover:bg-hover"
        >
          <FileUp className="size-[1.5rem]" />
          Add PDF
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(event) => {
            actions.appendPdfs(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-4 overflow-y-auto p-4 sm:grid-cols-3">
        {pages.map((entry, index) => (
          <div key={entry.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                actions.scrollTo(entry.id);
                onOpenChange(false);
              }}
              className="rounded-lg transition-transform hover:scale-[1.02]"
            >
              <Thumbnail entry={entry} pdf={sources[entry.source]?.pdf} />
            </button>
            <div className="flex items-center justify-between">
              <span className="pl-1 text-xs font-medium text-ink-3 tabular-nums">{index + 1}</span>
              <div className="flex">
                <SmallButton label="Move up" disabled={index === 0} onClick={() => actions.movePage(index, -1)}>
                  <ArrowUp />
                </SmallButton>
                <SmallButton label="Move down" disabled={index === pages.length - 1} onClick={() => actions.movePage(index, 1)}>
                  <ArrowDown />
                </SmallButton>
              </div>
            </div>
            <div className="flex justify-between rounded-lg bg-sunken p-0.5">
              <SmallButton label="Rotate" onClick={() => actions.rotatePage(entry.id)}>
                <RotateCw />
              </SmallButton>
              <SmallButton label="Duplicate" onClick={() => actions.duplicatePage(index)}>
                <Copy />
              </SmallButton>
              <SmallButton label="Insert blank page after" onClick={() => actions.addBlank(index + 1)}>
                <FilePlus2 />
              </SmallButton>
              <SmallButton label="Delete page" danger disabled={pages.length === 1} onClick={() => actions.deletePage(entry.id)}>
                <Trash2 />
              </SmallButton>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
