"use client";

import { Check, Copy, Download, Puzzle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/tools/files";
import { buildShotExtension, SHOT_EXTENSION_VERSION, shotBookmarklet } from "@/lib/tools/shot/extension";
import { cn } from "@/lib/utils";
import { InstallApp } from "../install-app";
import { Group, Row } from "../screen/panels";

const noop = () => () => {};
const getOrigin = () => window.location.origin;

function Step({ n, children }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-hover text-2xs font-semibold">{n}</span>
      <span className="min-w-0 pt-0.5">{children}</span>
    </li>
  );
}

function CopyText({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => toast.error("Couldn't copy"),
        )
      }
      className="inline-flex h-7 items-center gap-1 rounded-md bg-hover px-2 align-middle text-xs font-semibold hover:bg-selected"
    >
      {done ? <Check className="size-[1.2rem]" /> : <Copy className="size-[1.2rem]" />}
      Copy
    </button>
  );
}

export function Keys({ keys }) {
  return (
    <span className="flex shrink-0 gap-1">
      {keys.map((part) => (
        <kbd key={part} className="min-w-7 rounded-md bg-surface px-2 py-1 text-center font-sans text-xs font-semibold shadow-card">
          {part}
        </kbd>
      ))}
    </span>
  );
}

/** Bookmark button and the companion extension (captures any tab with shortcuts, including whole pages). */
export function ShotLaunch({ extension, isMac }) {
  const link = useRef(null);
  const origin = useSyncExternalStore(noop, getOrigin, () => "");
  const [building, setBuilding] = useState(false);
  const code = origin ? shotBookmarklet(origin) : "";

  // React refuses javascript: links in JSX, so the bookmarklet is set on the element directly.
  useEffect(() => {
    if (link.current && code) link.current.setAttribute("href", code);
  }, [code]);

  const download = async () => {
    setBuilding(true);
    try {
      downloadBlob(await buildShotExtension(origin), "life-tracker-screenshotr.zip");
    } catch (error) {
      toast.error("Couldn't build the extension", { description: error?.message });
    } finally {
      setBuilding(false);
    }
  };

  const outdated = extension && extension !== SHOT_EXTENSION_VERSION;
  const alt = isMac ? "⌥" : "Alt";
  const shift = isMac ? "⇧" : "Shift";

  return (
    <div className="flex flex-col gap-3">
      <InstallApp name="Screenshotr" isMac={isMac} />

      <Group title="Browser extension">
        <Row
          label="Capture any tab with a shortcut"
          hint="Screenshot the visible part of a tab, an area you drag, or the whole scrolling page — no screen-share prompt. Each capture opens here, ready to annotate. For Chrome, Edge, Brave and Arc."
        >
          <span
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
              extension ? (outdated ? "bg-warning-soft text-warning" : "bg-success-soft text-success") : "bg-sunken text-ink-3",
            )}
          >
            <Puzzle className="size-[1.3rem]" />
            {extension ? (outdated ? "Update available" : "Connected") : "Not installed"}
          </span>
        </Row>
        <div className="flex flex-col gap-3 py-3">
          <button
            type="button"
            onClick={download}
            disabled={!origin || building}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-ground hover:bg-ink/85 disabled:opacity-50 sm:w-auto sm:self-start"
          >
            <Download className="size-[1.5rem]" />
            {outdated ? "Download the update" : "Download extension"}
          </button>
          <ol className="flex flex-col gap-2">
            <Step n={1}>Unzip the download and keep the folder somewhere it won&apos;t be deleted.</Step>
            <Step n={2}>
              Open <span className="font-mono text-xs font-semibold">chrome://extensions</span> <CopyText text="chrome://extensions" /> in a new tab (Edge: <span className="font-mono text-xs">edge://extensions</span>).
            </Step>
            <Step n={3}>
              Turn on <b>Developer mode</b>, click <b>Load unpacked</b> and choose the <span className="font-mono text-xs">life-tracker-screenshotr</span> folder.
            </Step>
            <Step n={4}>Pin it from the puzzle-piece menu, then reload this page — the badge above turns to Connected.</Step>
          </ol>
        </div>
        {[
          ["1", "Visible part of the tab"],
          ["2", "Drag an area of the tab"],
          ["3", "Whole scrolling page"],
        ].map(([key, label]) => (
          <Row key={key} label={label} disabled={!extension}>
            <Keys keys={[alt, shift, key]} />
          </Row>
        ))}
        <p className="pb-3 text-xs text-ink-3">
          These work in any tab while the browser is in front. Browser pages (chrome://, the Web Store) can&apos;t be captured. Change the keys at{" "}
          <span className="font-mono">chrome://extensions/shortcuts</span>.
        </p>
      </Group>

      <Group title="Bookmark button">
        <Row label="Open Screenshotr from any site" hint="Drag it to your bookmarks bar. It opens Screenshotr in its own small window, or brings back the one already open." stack>
          <div className="flex flex-wrap items-center gap-2">
            <a
              ref={link}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                toast("Drag this button onto your bookmarks bar", { description: isMac ? "Show the bar with ⌘ Shift B" : "Show the bar with Ctrl Shift B" });
              }}
              draggable
              className="flex h-10 cursor-grab items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-ground shadow-card active:cursor-grabbing"
            >
              <span className="size-2.5 rounded-sm ring-2 ring-ground" />
              Screenshotr
            </a>
            <span className="text-xs text-ink-3">← drag me to the bookmarks bar</span>
          </div>
        </Row>
      </Group>
    </div>
  );
}
