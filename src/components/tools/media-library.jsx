"use client";

import { AudioLines, Download, FolderOpen, Image as ImageIcon, Play, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { downloadBlob, formatBytes } from "@/lib/tools/files";
import { deleteMedia, fmtClock, mediaBlob, saveMedia } from "@/lib/tools/media-store";
import { cn } from "@/lib/utils";

const KIND_LABELS = { video: "Videos", audio: "Audio", image: "Images" };
const KIND_ICONS = { video: Video, audio: AudioLines, image: ImageIcon };

function when(time) {
  const date = new Date(time);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function downloadItem(item) {
  try {
    downloadBlob(await mediaBlob(item), item.name);
  } catch (error) {
    toast.error(error.message);
  }
}

/** Lists saved recordings and screenshots with play, download and delete. */
export function MediaLibrary({ title = "Recordings", items, setItems, kinds = ["video", "audio", "image"], empty, actions, itemAction }) {
  const counts = Object.fromEntries(kinds.map((kind) => [kind, items.filter((item) => item.kind === kind).length]));
  const firstWithItems = kinds.find((kind) => counts[kind]) ?? kinds[0];
  const [chosen, setKind] = useState(null);
  const kind = chosen && (counts[chosen] || !counts[firstWithItems]) ? chosen : firstWithItems;
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const shown = items.filter((item) => item.kind === kind);

  const remove = (item) => {
    setItems((list) => list.filter((entry) => entry.id !== item.id));
    deleteMedia(item.id).catch(() => {});
    toast(`Deleted ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () => {
          saveMedia(item).catch(() => {});
          setItems((list) => [...list, item].sort((a, b) => b.createdAt - a.createdAt));
        },
      },
    });
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
        {actions}
        {kinds.length > 1 && (
          <Segmented
            label="Show"
            className="[&>button]:pointer-coarse:h-10"
            value={kind}
            onChange={setKind}
            options={kinds.map((value) => ({ value, label: KIND_LABELS[value], count: counts[value] }))}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface px-4 py-8 text-center text-sm text-ink-3 shadow-card">{empty ?? "Nothing saved yet."}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
            <MediaCard key={item.id} item={item} action={itemAction} onOpen={() => setOpen(item)} onDelete={() => remove(item)} />
          ))}
        </ul>
      )}

      <Viewer item={open} onClose={close} />
    </section>
  );
}

function MediaCard({ item, action, onOpen, onDelete }) {
  const Icon = KIND_ICONS[item.kind] ?? Video;
  return (
    <li className="group flex animate-rise flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
      <button type="button" onClick={onOpen} className="relative aspect-video w-full overflow-hidden bg-sunken" aria-label={`Open ${item.name}`}>
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-4">
            <Icon className="size-[3.2rem]" strokeWidth={1.5} />
          </span>
        )}
        {item.kind !== "image" && (
          <>
            <span className="absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors group-hover:bg-ink/20">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface/90 text-ink opacity-0 shadow-float transition-opacity group-hover:opacity-100">
                <Play className="size-[1.6rem] fill-current" />
              </span>
            </span>
            {Number.isFinite(item.duration) && (
              <span className="absolute right-2 bottom-2 rounded-md bg-ink/75 px-1.5 py-0.5 text-2xs font-semibold text-ground tabular-nums">
                {fmtClock(item.duration)}
              </span>
            )}
          </>
        )}
        {item.badge && (
          <span className="absolute top-2 left-2 rounded-md bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">{item.badge}</span>
        )}
      </button>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={item.name}>
            {item.name}
          </p>
          <p className="flex items-center gap-1 text-2xs text-ink-3">
            {item.handle && <FolderOpen className="size-[1.1rem]" />}
            {formatBytes(item.size)}
            {item.width ? ` · ${item.width}×${item.height}` : ""} · {when(item.createdAt)}
          </p>
        </div>
        {action && (
          <Tooltip label={action.hint}>
            <button
              type="button"
              onClick={() => action.onClick(item)}
              className="flex h-8 items-center gap-1 rounded-lg bg-sunken px-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-[1.3rem]"
            >
              {action.icon}
              {action.label}
            </button>
          </Tooltip>
        )}
        <Tooltip label="Download">
          <button
            type="button"
            onClick={() => downloadItem(item)}
            aria-label={`Download ${item.name}`}
            className="flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            <Download className="size-[1.5rem]" />
          </button>
        </Tooltip>
        <Tooltip label="Delete">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.name}`}
            className="flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-[1.5rem]" />
          </button>
        </Tooltip>
      </div>
    </li>
  );
}

function Viewer({ item, onClose }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!item) return;
    let objectUrl = null;
    let live = true;
    mediaBlob(item)
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) => {
        toast.error(error.message);
        onClose();
      });
    return () => {
      live = false;
      setUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item, onClose]);

  return (
    <Dialog open={Boolean(item)} onOpenChange={(next) => !next && onClose()} title={item?.name ?? ""} className="max-w-[110rem]" autoFocus={false}>
      <div className={cn("flex items-center justify-center overflow-hidden rounded-xl", item?.kind === "audio" ? "bg-sunken p-6" : "bg-black")}>
        {!url || !item ? (
          <div className="aspect-video w-full animate-shimmer bg-skeleton" />
        ) : item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.name} className="max-h-[75vh] w-auto" />
        ) : item.kind === "audio" ? (
          <audio src={url} controls autoPlay className="w-full" />
        ) : (
          <video src={url} controls autoPlay playsInline className="max-h-[75vh] w-full" />
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-ink-3">
          {formatBytes(item?.size)}
          {item?.width ? ` · ${item.width}×${item.height}` : ""}
          {Number.isFinite(item?.duration) ? ` · ${fmtClock(item.duration)}` : ""}
        </p>
        <button
          type="button"
          onClick={() => item && downloadItem(item)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-ground hover:bg-ink/85"
        >
          <Download className="size-[1.5rem]" />
          Download
        </button>
      </div>
    </Dialog>
  );
}
