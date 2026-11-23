"use client";

import { Download, FolderOpen, HardDrive, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { allowFolder, canPickFolder, forgetFolder, loadFolder, pickFolder } from "@/lib/tools/save-folder";
import { cn } from "@/lib/utils";

const noop = () => () => {};
const getBrave = () => Boolean(navigator.brave);

/** A tool's chosen output folder: loads the remembered one and offers pick / allow again / forget. */
export function useSaveFolder(tool, startIn) {
  const supported = useSyncExternalStore(noop, canPickFolder, () => false);
  const [folder, setFolder] = useState({ handle: null, permission: null });

  useEffect(() => {
    loadFolder(tool).then(setFolder).catch(() => {});
  }, [tool]);

  const pick = useCallback(async () => {
    try {
      const next = await pickFolder(tool, startIn);
      setFolder(next);
      toast.success(`Saving to “${next.handle.name}”`);
      return next;
    } catch (error) {
      if (error?.name !== "AbortError") toast.error("Couldn't use that folder");
      return null;
    }
  }, [tool, startIn]);

  const allow = useCallback(async () => {
    const next = await allowFolder(folder);
    setFolder(next);
    if (next.permission !== "granted") toast.error("The browser didn't allow access to the folder");
    return next;
  }, [folder]);

  const forget = useCallback(() => {
    forgetFolder(tool);
    setFolder({ handle: null, permission: null });
  }, [tool]);

  return { ...folder, supported, ready: Boolean(folder.handle && folder.permission === "granted"), pick, allow, forget };
}

const TARGETS = [
  { value: "folder", label: "A folder", icon: FolderOpen },
  { value: "downloads", label: "Downloads", icon: Download },
  { value: "browser", label: "Browser only", icon: HardDrive },
];

/**
 * "Save to" picker: a folder you choose, the Downloads folder, or only this browser.
 * `what` names the files, e.g. "recordings".
 */
export function SaveLocation({ value, onChange, folder, what = "files", compact = false }) {
  const brave = useSyncExternalStore(noop, getBrave, () => false);
  const choose = async (target) => {
    if (target === "folder" && !folder.handle) {
      const picked = await folder.pick();
      if (!picked) return;
    }
    onChange(target);
  };

  const hint = {
    folder: folder.supported
      ? `New ${what} are written straight into the folder. Browsers only show a folder's name, never its full path.`
      : "This browser can't save into folders. Downloads works everywhere.",
    downloads: `Each new file goes to your browser's Downloads folder, as set in its settings.`,
    browser: `${what[0].toUpperCase()}${what.slice(1)} stay in the list below, in this browser only, until you download or delete them.`,
  }[value];

  return (
    <div className={cn("flex flex-col gap-2", !compact && "py-3")}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-medium">Save to</p>
        <p className="min-w-0 flex-1 basis-60 text-xs text-ink-3">{hint}</p>
      </div>
      {/* In a narrow side panel the three choices stack instead of truncating. */}
      <div role="radiogroup" aria-label="Save to" className={cn("grid gap-1 rounded-xl bg-sunken p-1", compact ? "grid-cols-1" : "grid-cols-3")}>
        {TARGETS.map((target) => {
          const Icon = target.icon;
          const active = value === target.value;
          const disabled = target.value === "folder" && !folder.supported;
          return (
            <button
              key={target.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => choose(target.value)}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-40",
                compact ? "justify-start" : "justify-center",
                active && "bg-surface text-ink shadow-card",
              )}
            >
              <Icon className="size-[1.4rem] shrink-0" />
              <span className="truncate">{target.label}</span>
            </button>
          );
        })}
      </div>
      {!folder.supported && (
        <p className="rounded-lg bg-sunken px-2.5 py-2 text-xs text-ink-2">
          {brave ? (
            <>
              <b>Brave turns folder saving off.</b> To pick a folder, open <span className="font-mono text-2xs font-semibold select-all">brave://flags/#file-system-access-api</span>, set it to
              Enabled and relaunch Brave.
            </>
          ) : (
            <>
              <b>A folder</b> needs Chrome, Edge or another Chromium browser on a computer. Safari, Firefox and phones can only use Downloads.
            </>
          )}
        </p>
      )}
      {value === "folder" && folder.supported && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={folder.pick} className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg bg-hover px-3 text-sm font-medium hover:bg-selected">
            <FolderOpen className="size-[1.5rem] shrink-0" />
            <span className="truncate">{folder.handle ? folder.handle.name : "Choose folder"}</span>
          </button>
          {folder.handle && folder.permission !== "granted" && (
            <button type="button" onClick={folder.allow} className="flex h-9 items-center gap-1.5 rounded-lg bg-warning-soft px-3 text-sm font-semibold text-warning hover:bg-warning-soft/70">
              <RotateCcw className="size-[1.4rem]" />
              Allow again
            </button>
          )}
          {folder.handle && (
            <button
              type="button"
              onClick={() => {
                folder.forget();
                onChange("downloads");
              }}
              title="Stop using this folder"
              aria-label="Stop using this folder"
              className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-[1.5rem]" />
            </button>
          )}
          {folder.handle && folder.permission !== "granted" && (
            <span className="basis-full text-xs text-warning">The browser asks again after a restart — click Allow again before you start.</span>
          )}
        </div>
      )}
    </div>
  );
}
