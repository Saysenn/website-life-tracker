"use client";

import { Download, FileArchive, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { Switch } from "@/components/ui/switch";
import { useFileQueue } from "@/hooks/use-file-queue";
import { downloadBlob, downloadZip } from "@/lib/tools/files";
import { SUPPORTED_LABEL, stripMetadata } from "@/lib/tools/strip-metadata";
import { cn, plural } from "@/lib/utils";
import { DropZone } from "./drop-zone";
import { FileRow } from "./file-row";
import { BigButton, QueueSummary } from "./queue-summary";
import { ToolHeader } from "./tool-header";

const SENSITIVE = new Set(["GPS location", "Author", "Owner name", "Serial number", "Last edited by", "Comment & edit authors"]);

function RemovedChips({ result }) {
  if (!result.removed.length) return <p className="mt-2 text-xs text-ink-3">{result.note}</p>;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-2xs font-medium text-ink-3">Removed</span>
      {result.removed.map((label) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium",
            SENSITIVE.has(label) ? "bg-warning-soft text-warning" : "bg-sunken text-ink-2",
          )}
        >
          {label === "GPS location" && <MapPin className="size-[1.1rem]" />}
          {label}
        </span>
      ))}
    </div>
  );
}

const statusLabel = (item) =>
  ({
    queued: "Waiting",
    working: item.progress < 0.6 ? "Reading" : "Cleaning",
    done: item.result?.removed.length ? "Cleaned" : "Already clean",
    error: "Skipped",
  })[item.status];

export function MetadataCleaner({ full = true }) {
  const { items, add, start, remove, clear, stats } = useFileQueue(stripMetadata);
  const [suffix, setSuffix] = useState(true);
  const [zipping, setZipping] = useState(false);

  // Clean as soon as files arrive.
  useEffect(() => {
    if (stats.queued > 0 && !stats.busy) start({ suffix });
  }, [stats.queued, stats.busy, start, suffix]);

  const finished = items.filter((item) => item.status === "done");
  const removedCount = finished.reduce((sum, item) => sum + item.result.removed.length, 0);
  const gps = finished.filter((item) => item.result.removed.includes("GPS location")).length;
  const working = stats.busy || stats.queued > 0;

  const downloadAll = async () => {
    if (finished.length === 1) return downloadBlob(finished[0].result.blob, finished[0].result.name);
    setZipping(true);
    try {
      await downloadZip(finished.map((item) => item.result), `cleaned-files-${finished.length}.zip`);
    } catch {
      toast.error("Couldn't build the zip");
    } finally {
      setZipping(false);
    }
  };

  return (
    <Page className="max-w-[76rem]">
      <ToolHeader
        icon="eraser"
        back={full}
        title="Metadata cleaner"
        description="Drop one file or a whole batch — hidden details like GPS, camera, author and dates are stripped without touching quality."
      />

      <div className="mt-5 grid gap-3">
        {items.length === 0 ? (
          <DropZone
            onFiles={add}
            title="Choose files"
            hint="or drop them here — any number, any type"
            note={`Works with ${SUPPORTED_LABEL}`}
          />
        ) : (
          <DropZone onFiles={add} compact />
        )}

        <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add “-clean” to file names</p>
            <p className="text-xs text-ink-3">{suffix ? "photo.jpg → photo-clean.jpg" : "Keep the original names"}</p>
          </div>
          <Switch checked={suffix} onCheckedChange={setSuffix} disabled={working} />
        </label>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex flex-col">
          <QueueSummary
            stats={stats}
            title={
              working
                ? `Cleaning ${Math.min(stats.done + stats.failed + 1, stats.total)} of ${stats.total}…`
                : `${plural(stats.done, "file")} ready`
            }
            subtitle={
              working
                ? "Keep this tab open"
                : [
                    removedCount ? `${plural(removedCount, "item")} removed` : "Nothing hidden found",
                    gps ? `${gps} with GPS` : null,
                    stats.failed ? `${stats.failed} skipped` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            onClear={clear}
            action={
              <BigButton onClick={downloadAll} disabled={!finished.length || working || zipping}>
                {finished.length > 1 ? <FileArchive /> : <Download />}
                {finished.length > 1 ? `Download all (${finished.length}) .zip` : "Download"}
              </BigButton>
            }
          />

          <ul className="order-first grid gap-2 sm:order-none">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                statusLabel={statusLabel(item)}
                downloadLabel="Download"
                onDownload={() => downloadBlob(item.result.blob, item.result.name)}
                onRemove={() => remove(item.id)}
                details={item.result && <RemovedChips result={item.result} />}
              />
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
