"use client";

import { BookMarked, Copy, Download, MousePointerClick, Play, Puzzle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Page } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { downloadBlob } from "@/lib/tools/files";
import {
  READER_DEFAULTS,
  SPEED_PRESETS,
  buildBookmarklet,
  buildExtensionZip,
  loadReaderSource,
  readerVersion,
  wrapSource,
} from "@/lib/tools/reader";
import { cn } from "@/lib/utils";
import { ToolHeader } from "./tool-header";

const SETTINGS_KEY = "manhwa-reader-defaults";
const MIN = 5;
const MAX = 600;
const ratio = Math.log(MAX / MIN);
const toSlider = (speed) => Math.round((Math.log(speed / MIN) / ratio) * 1000);
const fromSlider = (value) => Math.round(MIN * Math.exp((value / 1000) * ratio));

const BOOKMARK_STEPS = [
  { title: "Show the bookmarks bar", body: "Press Ctrl+Shift+B (⌘+Shift+B on a Mac)." },
  { title: "Drag the button up", body: "Drop “Manhwa reader” onto the bookmarks bar." },
  { title: "Click it on any chapter", body: "The toolbar appears at the bottom. Click it again to hide it." },
];

const EXTENSION_STEPS = [
  { title: "Download and unzip", body: "Keep the folder somewhere it can stay, like Documents." },
  { title: "Load it", body: "Open chrome://extensions, turn on Developer mode, click Load unpacked and pick the folder." },
  { title: "Pin and read", body: "Pin it from the puzzle icon. Click it or press Alt+Shift+R on a chapter." },
];

const SHORTCUTS = [
  ["Space", "Play or pause"],
  ["+  −", "Faster or slower"],
  ["N", "Next chapter now"],
  ["F", "Float on top of other apps"],
  ["H", "Shrink to a small pill"],
  ["Esc", "Pause"],
  ["Hold", "Press and hold the page to pause"],
];

const SAMPLE_LINES = [
  "Another long night at the tower…",
  "You think the gate opens for just anyone?",
  "Hold on. Read that again, slowly.",
  "The system window flickered once, then stayed.",
  "[ Quest updated: climb to the 2nd floor ]",
  "If you scroll too fast you miss the good parts.",
  "Too slow and you fall asleep. Find your speed.",
  "Ten years later.",
  "Wait — that crest. I've seen it before.",
  "To be continued.",
];

function readSaved() {
  try {
    return { ...READER_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return READER_DEFAULTS;
  }
}

function Steps({ steps }) {
  return (
    <ol className="grid gap-2.5 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-2.5 rounded-xl bg-sunken p-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink-2 shadow-card">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{step.title}</p>
            <p className="mt-0.5 text-xs text-ink-3">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SettingRow({ title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** The bookmark and the extension carry a copy of the script, so they stay on the version they were made from. */
function UpdateNote({ version, what }) {
  return (
    <p className="mt-3 rounded-xl bg-sunken px-3 py-2.5 text-xs text-ink-3">
      <span className="font-semibold text-ink-2">Latest is v{version}.</span> Your copy doesn&apos;t update itself — the version shows at the
      bottom of the toolbar&apos;s settings. If it&apos;s older or missing: {what}.
    </p>
  );
}

const PANEL_TONES = [
  ["#e9dfcf", "#c9b79c"],
  ["#dfe7ec", "#a9bccb"],
  ["#ece1d6", "#c8ab95"],
  ["#e3e8dc", "#aebc9f"],
  ["#eadcd8", "#c4a49c"],
];

const escapeXml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One drawn panel as an image, so the floating window can pick it up like a real chapter. */
function panelImage(line, index) {
  const [ground, figure] = PANEL_TONES[index % PANEL_TONES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100">
<rect width="800" height="1100" fill="${ground}"/>
<ellipse cx="400" cy="1180" rx="300" ry="420" fill="${figure}" opacity="0.7"/>
<circle cx="400" cy="700" r="110" fill="${figure}"/>
<rect x="110" y="170" width="580" height="150" rx="75" fill="#fffdfa"/>
<path d="M380 318 L400 370 L430 318 Z" fill="#fffdfa"/>
<text x="400" y="258" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" font-weight="600" fill="#1e1b16">${escapeXml(line)}</text>
<text x="770" y="1076" text-anchor="end" font-family="system-ui, sans-serif" font-size="22" fill="#8c8274">Panel ${index + 1}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A made up chapter so the speed and the floating window can be tried without leaving the page. */
function SampleChapter() {
  return (
    <div className="mx-auto flex max-w-[48rem] flex-col gap-1">
      {SAMPLE_LINES.map((line, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={line}
          src={panelImage(line, index)}
          alt={`Panel ${index + 1}: ${line}`}
          width={800}
          height={1100}
          className="block h-auto w-full rounded-xl"
        />
      ))}
    </div>
  );
}

export function ManhwaReader() {
  const [defaults, setDefaults] = useState(READER_DEFAULTS);
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  const [method, setMethod] = useState("bookmark");
  const [zipping, setZipping] = useState(false);
  const linkRef = useRef(null);

  useEffect(() => {
    loadReaderSource()
      .then((text) => {
        setDefaults(readSaved());
        setSource(text);
      })
      .catch(() => setFailed(true));
    return () => window.__manhwaReader?.destroy();
  }, []);

  const update = (patch) =>
    setDefaults((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private window: settings last until the page closes */
      }
      return next;
    });

  const bookmarklet = useMemo(() => (source ? buildBookmarklet(source, defaults) : ""), [source, defaults]);

  // React refuses javascript: links, so the bookmark's address is set directly on the element.
  useEffect(() => {
    if (bookmarklet) linkRef.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet, method]);

  const tryHere = () => {
    if (!source) return;
    window.__manhwaReader?.destroy();
    const script = document.createElement("script");
    script.textContent = wrapSource(source, { ...defaults, ignoreSaved: true });
    document.head.append(script);
    script.remove();
    document.getElementById("sample-chapter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      toast.success("Bookmark address copied", { description: "Paste it as the URL of a new bookmark." });
    } catch {
      toast.error("Couldn't copy — drag the button instead");
    }
  };

  const downloadExtension = async () => {
    if (!source) return;
    setZipping(true);
    try {
      downloadBlob(await buildExtensionZip(source, defaults), "manhwa-reader-extension.zip");
      toast.success("Extension downloaded", { description: "Unzip it, then load it in chrome://extensions." });
    } catch {
      toast.error("Couldn't build the extension");
    } finally {
      setZipping(false);
    }
  };

  const copyExtensionsUrl = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      toast.success("Copied chrome://extensions", { description: "Paste it into the address bar." });
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Page className="max-w-[88rem]">
      <ToolHeader
        icon="reader"
        title="Manhwa reader"
        description="Auto-scroll any manhwa or webtoon site at your own speed, hands off the mouse. Add it to your browser once, then click it on any chapter."
        badge="Runs in your browser — nothing is sent anywhere"
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Starting settings" description="What the toolbar starts with on a new site. You can change all of it from the toolbar while reading.">
          <div className="rounded-xl bg-sunken p-3.5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink-2">Scroll speed</p>
              <p className="text-ink-3 tabular-nums">
                <span className="text-xl font-semibold text-ink">{defaults.speed}</span> <span className="text-xs">px / second</span>
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={toSlider(defaults.speed)}
              onChange={(event) => update({ speed: fromSlider(Number(event.target.value)) })}
              aria-label="Scroll speed"
              className="mt-2 w-full accent-ink"
            />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => update({ speed: preset.value })}
                  className={cn(
                    "flex h-9 flex-col items-center justify-center rounded-lg text-xs leading-tight transition-colors",
                    defaults.speed === preset.value ? "bg-ink text-ground" : "bg-surface text-ink-2 shadow-card hover:bg-hover",
                  )}
                >
                  <span className="font-semibold">{preset.label}</span>
                  <span className="text-2xs opacity-70 tabular-nums">{preset.value}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 divide-y divide-grid">
            <SettingRow title="Go to the next chapter at the end" hint="Finds the site's Next link and keeps scrolling">
              <Switch checked={defaults.autoNext} onCheckedChange={(autoNext) => update({ autoNext })} />
            </SettingRow>
            <SettingRow title="Find the next chapter by" hint="Address changes chapter-6 to chapter-7 in the link">
              <Segmented
                label="Find the next chapter by"
                value={defaults.nextBy}
                onChange={(nextBy) => update({ nextBy })}
                options={[
                  { value: "auto", label: "Smart" },
                  { value: "url", label: "Address" },
                ]}
              />
            </SettingRow>
            <SettingRow title="Wait before the next chapter">
              <Segmented
                label="Wait before the next chapter"
                value={defaults.nextDelay}
                onChange={(nextDelay) => update({ nextDelay })}
                options={[0, 4, 10].map((value) => ({ value, label: value ? `${value}s` : "None" }))}
              />
            </SettingRow>
            <SettingRow title="Press and hold to pause" hint="Hold the mouse or a finger on the page">
              <Switch checked={defaults.holdPause} onCheckedChange={(holdPause) => update({ holdPause })} />
            </SettingRow>
            <SettingRow title="Fade the bar while reading" hint="It comes back when you point at it">
              <Switch checked={defaults.fade} onCheckedChange={(fade) => update({ fade })} />
            </SettingRow>
            <SettingRow title="Toolbar position">
              <Segmented
                label="Toolbar position"
                value={defaults.position}
                onChange={(position) => update({ position })}
                options={[
                  { value: "top", label: "Top" },
                  { value: "bottom", label: "Bottom" },
                ]}
              />
            </SettingRow>
          </div>
        </Card>

        <Card
          title="Add it to your browser"
          description="Pick one. Change the starting settings first — they're built in."
          actions={
            <Segmented
              label="Install method"
              value={method}
              onChange={setMethod}
              options={[
                { value: "bookmark", label: "Bookmark" },
                { value: "extension", label: "Extension" },
              ]}
            />
          }
        >
          {failed ? (
            <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">Couldn&apos;t load the reader script. Refresh to try again.</p>
          ) : method === "bookmark" ? (
            <>
              <div className="flex flex-col items-center gap-3 rounded-xl bg-sunken px-4 py-6 text-center">
                <a
                  ref={linkRef}
                  onClick={(event) => {
                    event.preventDefault();
                    tryHere();
                  }}
                  draggable
                  aria-disabled={!source}
                  className={cn(
                    "inline-flex h-11 cursor-grab items-center gap-2 rounded-xl bg-ink px-5 text-base font-semibold text-ground shadow-float transition-transform active:cursor-grabbing active:scale-[0.98]",
                    !source && "pointer-events-none opacity-50",
                  )}
                >
                  <BookMarked className="size-[1.7rem]" />
                  Manhwa reader
                </a>
                <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                  <MousePointerClick className="size-[1.4rem]" />
                  Drag this button to your bookmarks bar
                </p>
              </div>
              <div className="mt-3">
                <Steps steps={BOOKMARK_STEPS} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="soft" size="sm" onClick={copyBookmarklet} disabled={!source}>
                  <Copy />
                  Copy bookmark address
                </Button>
                <p className="text-xs text-ink-3">For phones: make any bookmark, then paste this as its URL.</p>
              </div>
              <UpdateNote version={readerVersion(source)} what="Drag the button again and delete the old bookmark" />
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 rounded-xl bg-sunken px-4 py-6 text-center">
                <Button onClick={downloadExtension} pending={zipping} disabled={!source} className="h-11 rounded-xl px-5 text-base">
                  {!zipping && <Download />}
                  Download extension
                </Button>
                <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                  <Puzzle className="size-[1.4rem]" />
                  Chrome, Edge, Brave, Arc and Opera
                </p>
              </div>
              <div className="mt-3">
                <Steps steps={EXTENSION_STEPS} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="soft" size="sm" onClick={copyExtensionsUrl}>
                  <Copy />
                  Copy chrome://extensions
                </Button>
                <p className="text-xs text-ink-3">
                  The extension also carries on into the next chapter after the page reloads, and remembers your speed per site.
                </p>
              </div>
              <UpdateNote version={readerVersion(source)} what="Download again, replace the files in the same folder, then click the reload arrow in chrome://extensions" />
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="While reading" description="Keys work as soon as the toolbar is open">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="inline-flex h-6 min-w-8 items-center justify-center rounded-md bg-sunken px-1.5 font-mono text-xs font-semibold text-ink-2 shadow-card">
                    {key}
                  </kbd>
                </dt>
                <dd className="text-sm text-ink-2">{label}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card
          title="Try it here"
          description="Opens the real toolbar on this page with your starting settings. Scroll the sample chapter below."
        >
          <Button onClick={tryHere} disabled={!source} className="h-10 rounded-xl px-4">
            <Play />
            Open the toolbar on this page
          </Button>
        </Card>
      </div>

      <section id="sample-chapter" className="mt-6 scroll-mt-4 pb-24">
        <p className="mb-3 text-center text-xs font-medium text-ink-3">Sample chapter</p>
        <SampleChapter />
      </section>
    </Page>
  );
}
