"use client";

import { Bookmark, Check, Copy, Download, Puzzle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/tools/files";
import { bookmarklet, buildExtension, EXTENSION_VERSION } from "@/lib/tools/screen/launcher";
import { cn } from "@/lib/utils";
import { InstallApp } from "../install-app";
import { Group, Row } from "./panels";

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

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => toast.error("Couldn't copy"),
        );
      }}
      className="inline-flex h-7 items-center gap-1 rounded-md bg-hover px-2 align-middle text-xs font-semibold hover:bg-selected"
    >
      {done ? <Check className="size-[1.2rem]" /> : <Copy className="size-[1.2rem]" />}
      {label}
    </button>
  );
}

/** Quick ways in: a bookmark button and a browser extension with shortcuts in every tab. */
export function LaunchPanel({ extension, isMac }) {
  const link = useRef(null);
  const origin = useSyncExternalStore(noop, getOrigin, () => "");
  const [building, setBuilding] = useState(false);

  // React refuses javascript: links in JSX, so the bookmarklet is set on the element directly.
  const code = origin ? bookmarklet(origin) : "";
  useEffect(() => {
    if (link.current && code) link.current.setAttribute("href", code);
  }, [code]);

  const download = async () => {
    setBuilding(true);
    try {
      downloadBlob(await buildExtension(origin), "life-tracker-recorder.zip");
    } catch (error) {
      toast.error("Couldn't build the extension", { description: error?.message });
    } finally {
      setBuilding(false);
    }
  };

  const outdated = extension && extension !== EXTENSION_VERSION;
  const alt = isMac ? "⌥ Option" : "Alt";

  return (
    <div className="flex flex-col gap-3">
      <InstallApp name="Screen Recorder" isMac={isMac} />

      <Group title="Bookmark button">
        <Row label="Open the recorder from any site" hint="Drag the button to your bookmarks bar. Clicking it opens the recorder in a small window — or brings back the one that's already open, without stopping a recording." stack>
          <div className="flex flex-wrap items-center gap-2">
            <a
              ref={link}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                toast("Drag this button onto your bookmarks bar", { description: isMac ? "Show the bar with ⌘ Shift B" : "Show the bar with Ctrl Shift B" });
              }}
              draggable
              className="flex h-10 cursor-grab items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white shadow-card active:cursor-grabbing"
            >
              <span className="size-2.5 rounded-full bg-white" />
              Recorder
            </a>
            <span className="text-xs text-ink-3">← drag me to the bookmarks bar</span>
          </div>
        </Row>
      </Group>

      <Group title="Browser extension">
        <Row
          label="Control recording from every tab"
          hint="A toolbar button with the live timer, start/stop, pause and mic; a badge with the recording time; shortcuts that work in any tab; and for tutorial mode, zoom that follows your clicks and typing plus drawing right on the page. For Chrome, Edge, Brave and Arc."
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
            <Step n={1}>Unzip the download. Keep the folder somewhere it won&apos;t be deleted.</Step>
            <Step n={2}>
              Open <span className="font-mono text-xs font-semibold">chrome://extensions</span> <CopyButton text="chrome://extensions" label="Copy" /> in a new tab (Edge: <span className="font-mono text-xs">edge://extensions</span>).
            </Step>
            <Step n={3}>Turn on <b>Developer mode</b>, click <b>Load unpacked</b> and choose the <span className="font-mono text-xs">life-tracker-recorder</span> folder.</Step>
            <Step n={4}>Pin it from the puzzle-piece menu so the button and timer stay in your toolbar, then reload this page and any tabs you want to show in a tutorial.</Step>
          </ol>
        </div>
        {[
          ["R", "Start / stop recording"],
          ["P", "Pause / resume"],
          ["D", "Draw on the page"],
          ["O", "Open the controls"],
        ].map(([key, label]) => (
          <Row key={key} label={label} disabled={!extension}>
            <span className="flex gap-1">
              {[alt, isMac ? "⇧ Shift" : "Shift", key].map((part) => (
                <kbd key={part} className="rounded-md bg-surface px-2 py-1 font-sans text-xs font-semibold shadow-card">
                  {part}
                </kbd>
              ))}
            </span>
          </Row>
        ))}
        <p className="pb-3 text-xs text-ink-3">
          <Bookmark className="mr-1 inline size-[1.2rem] align-[-0.2rem]" />
          These work in any tab while the browser is in front. Change them at <span className="font-mono">chrome://extensions/shortcuts</span> — “Mute” and “Zoom out” can be given keys there too.
        </p>
        <p className="pb-3 text-xs text-ink-3">
          Chrome warns that it can “read and change data on all websites”: that&apos;s what lets tutorial mode see where you click and type in any tab. It only reports while a tutorial recording runs, and only to this
          recorder — nothing leaves your computer.
        </p>
      </Group>
    </div>
  );
}
