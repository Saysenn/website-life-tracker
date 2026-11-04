"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { extensionOf, formatBytes } from "@/lib/tools/files";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./drop-zone";

const ICONS = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  sheet: FileSpreadsheet,
  slides: Presentation,
  doc: FileText,
  archive: FileArchive,
  file: File,
};

function kindOf(file) {
  const ext = extensionOf(file.name);
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (["xlsx", "xlsm", "ods", "csv"].includes(ext)) return "sheet";
  if (["pptx", "pptm", "odp"].includes(ext)) return "slides";
  if (["pdf", "docx", "docm", "odt", "txt", "md"].includes(ext)) return "doc";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  return "file";
}

function FileTypeIcon({ file, ...props }) {
  const Icon = ICONS[kindOf(file)];
  return <Icon {...props} />;
}

export function StatusPill({ status, children }) {
  const styles = {
    queued: "bg-sunken text-ink-3",
    working: "bg-data-soft text-data",
    done: "bg-success-soft text-success",
    error: "bg-danger-soft text-danger",
  };
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-2xs font-semibold", styles[status])}>
      {status === "working" && <Spinner className="size-[1.1rem]" />}
      {status === "done" && <Check className="size-[1.1rem]" strokeWidth={2.75} />}
      {status === "error" && <CircleAlert className="size-[1.1rem]" />}
      {children}
    </span>
  );
}

/**
 * One queued file. `thumb` shows an image preview instead of a type icon;
 * `details` renders under the name once the file is processed.
 */
export function FileRow({ item, thumb, statusLabel, downloadLabel, onDownload, onRemove, details }) {
  const { status, result } = item;
  const after = result?.blob?.size;
  const saved = after !== undefined && item.file.size > 0 ? 1 - after / item.file.size : 0;

  return (
    <li className="animate-rise rounded-2xl bg-surface p-3 shadow-card sm:p-3.5">
      <div className="flex items-center gap-3">
        <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sunken text-ink-3">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <FileTypeIcon file={item.file} className="size-[2rem]" strokeWidth={1.5} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={item.file.name}>
            {item.file.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3 tabular-nums">
            <span>{formatBytes(item.file.size)}</span>
            {status === "done" && after !== undefined && (
              <>
                <ArrowRight className="size-[1.1rem] text-ink-4" />
                <span className="font-medium text-ink-2">{formatBytes(after)}</span>
                {Math.abs(saved) >= 0.01 && (
                  <span className={cn("font-medium", saved > 0 ? "text-success" : "text-warning")}>
                    {saved > 0 ? "−" : "+"}
                    {Math.round(Math.abs(saved) * 100)}%
                  </span>
                )}
              </>
            )}
            <StatusPill status={status}>{statusLabel}</StatusPill>
          </div>
        </div>

        {status === "done" && (
          <button
            type="button"
            onClick={onDownload}
            aria-label={`Download ${result.name}`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-ground transition-colors hover:bg-ink/85"
          >
            <Download className="size-[1.5rem]" />
            <span className="hidden sm:inline">{downloadLabel}</span>
          </button>
        )}
        {status !== "working" && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.file.name}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="size-[1.6rem]" />
          </button>
        )}
      </div>

      {(status === "working" || status === "queued") && (
        <ProgressBar value={item.progress} tone="data" className="mt-2.5" />
      )}
      {status === "error" && <p className="mt-2 text-xs text-danger">{item.error}</p>}
      {status === "done" && details}
    </li>
  );
}
