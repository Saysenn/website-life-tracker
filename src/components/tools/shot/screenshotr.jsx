"use client";

import { AppWindow, ClipboardPaste, Copy, Crosshair, FolderOpen, ImagePlus, Monitor, Pencil, Pin, Repeat, Save, ScanText, Timer, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Page } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useStoredState } from "@/hooks/use-stored-state";
import { listMedia, mediaBlob, newId, saveMedia, thumbnail } from "@/lib/tools/media-store";
import { deliver, savedWhere } from "@/lib/tools/save-folder";
import { blobToCanvas, clipboardImage, cropCanvas, grabFrame, screenStream, shutter, stitch, stopSharing, urlToCanvas } from "@/lib/tools/shot/capture";
import { SHOT_TAG } from "@/lib/tools/shot/extension";
import { canReadCodes, readCodes, readText } from "@/lib/tools/shot/ocr";
import { canPinOnTop, pinCount, pinImage, subscribePins, unpinAll } from "@/lib/tools/shot/pin";
import { canvasToBlob, COLORS, encode, fileName, renderDoc } from "@/lib/tools/shot/render";
import { cn } from "@/lib/utils";
import { MediaLibrary } from "../media-library";
import { SaveLocation, useSaveFolder } from "../save-location";
import { TOUCH_SEGMENTS } from "../screen/panels";
import { ToolHeader } from "../tool-header";
import { AreaSelect } from "./area-select";
import { Editor } from "./editor";
import { ShotLaunch } from "./shot-launch";
import { BackdropControls, ShotSettings } from "./shot-settings";

const DEFAULTS = {
  when: "leave",
  delay: 3,
  keep: false,
  areaConfirm: false,
  loupe: true,
  sound: true,
  after: "copy",
  saveTo: "downloads",
  format: "png",
  quality: 0.9,
  scale: "2x",
  pattern: "Screenshot {date} at {time}",
  color: COLORS[0],
  size: "m",
  textSize: "m",
  textBg: false,
  fill: false,
  blurStyle: "pixelate",
  backdrop: { on: false, bg: "peach", padding: 8, radius: 1.5, shadow: true, aspect: "auto" },
  ocrLang: "eng",
  lastArea: null,
};
const STORED = {};

const noop = () => () => {};
const getMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const cancelled = () => new DOMException("Cancelled", "AbortError");

function CaptureButton({ icon: Icon, label, keys, onClick, disabled, primary }) {
  return (
    <Tooltip label={keys}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors disabled:opacity-40",
          primary ? "bg-ink text-ground hover:bg-ink/85" : "bg-surface text-ink shadow-card hover:bg-hover",
        )}
      >
        <Icon className="size-[1.6rem]" />
        {label}
      </button>
    </Tooltip>
  );
}

function ActionButton({ icon: Icon, label, keys, onClick, busy, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-50",
        primary ? "bg-ink text-ground hover:bg-ink/85" : "bg-hover text-ink hover:bg-selected",
      )}
    >
      <Icon className="size-[1.6rem] shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className={cn("text-2xs font-semibold", primary ? "text-ground/60" : "text-ink-3")}>{keys}</span>
    </button>
  );
}

/** Screenshot, annotate, pin and read text — a Shottr-style screenshot tool in the browser. */
export function Screenshotr() {
  const [stored, setStored] = useStoredState("uncler:shot-settings", STORED);
  const s = useMemo(() => ({ ...DEFAULTS, ...stored, backdrop: { ...DEFAULTS.backdrop, ...stored?.backdrop } }), [stored]);
  const set = useCallback((patch) => setStored((prev) => ({ ...prev, ...patch })), [setStored]);
  const folder = useSaveFolder("shot", "pictures");
  const isMac = useSyncExternalStore(noop, getMac, () => true);
  const pins = useSyncExternalStore(subscribePins, pinCount, () => 0);

  const [tab, setTab] = useState("editor");
  const [items, setItems] = useState([]);
  const [doc, setDoc] = useState(null);
  const [backdrop, setBackdrop] = useState(DEFAULTS.backdrop);
  const [selecting, setSelecting] = useState(null);
  const [waiting, setWaiting] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [extension, setExtension] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ocr, setOcr] = useState(null);
  const latest = useRef(null);
  const capturing = useRef(false);
  const cancelWait = useRef(null);
  const autosave = useRef(null);
  const fileInput = useRef(null);

  // ---- History ----
  useEffect(() => {
    let gone = false;
    (async () => {
      // Screenshots used to live in the screen recorder; they belong here now.
      const legacy = (await listMedia("screen").catch(() => [])).filter((item) => item.kind === "image");
      for (const item of legacy) await saveMedia({ ...item, tool: "shot" }).catch(() => {});
      const list = await listMedia("shot").catch(() => []);
      if (!gone) setItems(list.sort((a, b) => b.createdAt - a.createdAt));
    })();
    return () => {
      gone = true;
    };
  }, []);

  /** The current screenshot as it will be exported. */
  const rendered = useCallback(
    (opts = {}) => {
      if (!doc || !latest.current) return null;
      const model = { ...doc, ...latest.current };
      // Reading text: arrows, boxes and pen marks over the words confuse the reader, so only the redactions stay.
      if (opts.marks === false) model.shapes = (model.shapes ?? []).filter((shape) => shape.type === "blur" || shape.type === "erase");
      return renderDoc(model, { backdrop: opts.plain ? null : backdrop, scale: opts.scale ?? s.scale });
    },
    [doc, backdrop, s.scale],
  );

  // Keeps the history copy in step with the edits (a second after the last change).
  const scheduleSave = useCallback(() => {
    clearTimeout(autosave.current);
    autosave.current = setTimeout(async () => {
      const canvas = rendered({ scale: "2x" });
      if (!canvas || !doc) return;
      const blob = await canvasToBlob(canvas).catch(() => null);
      if (!blob) return;
      const patch = { blob, original: doc.original, size: blob.size, width: canvas.width, height: canvas.height, thumb: thumbnail(canvas, canvas.width, canvas.height), edits: latest.current, backdrop };
      setItems((list) => {
        const item = list.find((entry) => entry.id === doc.id);
        if (!item) return list;
        const next = { ...item, ...patch };
        saveMedia(next).catch(() => {});
        return list.map((entry) => (entry.id === doc.id ? next : entry));
      });
    }, 1000);
  }, [rendered, doc, backdrop]);

  useEffect(() => () => clearTimeout(autosave.current), []);

  // ---- Output ----
  const copy = useCallback(async () => {
    const canvas = rendered();
    if (!canvas) return;
    try {
      // Handing the clipboard a promise keeps Safari happy about the click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToBlob(canvas) })]);
      toast.success("Copied to the clipboard");
    } catch {
      toast.error("Couldn't copy — click the page first, then try again");
    }
  }, [rendered]);

  const save = useCallback(async () => {
    const canvas = rendered();
    if (!canvas) return;
    const blob = await encode(canvas, s.format, s.quality);
    const name = fileName(s.pattern, { width: canvas.width, height: canvas.height, ext: s.format });
    const result = await deliver({ saveTo: s.saveTo, folder, name, blob });
    if (result.where === "browser") toast.success("Kept in this browser", { description: "It's in the history below — download it any time." });
    else toast.success(`Saved ${savedWhere(result, folder)}`, { description: result.name ?? name });
  }, [rendered, s.format, s.quality, s.pattern, s.saveTo, folder]);

  const pin = useCallback(async () => {
    const canvas = rendered();
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
    const ratio = doc?.dpr || 1;
    const kind = await pinImage(blob, { width: Math.round(canvas.width / ratio), height: Math.round(canvas.height / ratio), name: doc?.name ?? "Screenshot" });
    if (!kind) toast.error("The browser blocked the pin window", { description: "Allow pop-ups for this site, then try again." });
    else if (kind === "window") toast("Pinned in a small window", { description: "This browser can't keep it above other apps — Chrome and Edge can." });
  }, [rendered, doc]);

  const readScreenshot = useCallback(async () => {
    const canvas = rendered({ plain: true, scale: "2x", marks: false });
    if (!canvas) return;
    setOcr({ busy: true, progress: 0, step: "Starting", text: "", codes: [] });
    try {
      const [codes, text] = await Promise.all([
        readCodes(canvas),
        readText(canvas, { language: s.ocrLang, onProgress: (progress, step) => setOcr((o) => (o ? { ...o, progress, step } : o)) }),
      ]);
      setOcr((o) => (o ? { ...o, busy: false, text, codes } : o));
      const toCopy = text || codes[0]?.value;
      if (toCopy) navigator.clipboard?.writeText(toCopy).catch(() => {});
    } catch (error) {
      setOcr(null);
      toast.error("Couldn't read the text", { description: error?.message ?? "The reader didn't load — check your connection." });
    }
  }, [rendered, s.ocrLang]);

  const toggleBackdrop = useCallback(() => {
    setBackdrop((b) => ({ ...b, on: !b.on }));
  }, []);

  useEffect(() => {
    if (doc) scheduleSave();
  }, [backdrop, doc, scheduleSave]);

  // ---- Opening a capture ----
  const open = useCallback(
    async (canvas, { dpr = 1, source = "Screenshot", auto = true } = {}) => {
      const id = newId();
      const name = fileName(s.pattern, { width: canvas.width, height: canvas.height, ext: "png" });
      const original = await canvasToBlob(canvas);
      const item = {
        id,
        tool: "shot",
        kind: "image",
        name,
        mime: "image/png",
        size: original.size,
        width: canvas.width,
        height: canvas.height,
        createdAt: Date.now(),
        blob: original,
        original,
        dpr,
        source,
        thumb: thumbnail(canvas, canvas.width, canvas.height),
        edits: { shapes: [], crop: null },
      };
      saveMedia(item).catch(() => toast.error("Couldn't keep it in the history — the browser's storage may be full"));
      setItems((list) => [item, ...list]);
      latest.current = { shapes: [], crop: null };
      setBackdrop(s.backdrop);
      setDoc({ id, base: canvas, original, dpr, name, shapes: [], crop: null });
      setTab("editor");
      if (s.sound && source !== "Pasted" && source !== "File") shutter();
      if (!auto) return;
      // Runs after the editor shows, using the fresh document.
      setTimeout(() => {
        const out = renderDoc({ base: canvas, dpr, shapes: [], crop: null }, { backdrop: s.backdrop, scale: s.scale });
        if (s.after === "copy" || s.after === "both") {
          const copyNow = () =>
            navigator.clipboard
              ?.write([new ClipboardItem({ "image/png": canvasToBlob(out) })])
              .then(() => toast.success("Copied to the clipboard", { description: `${out.width} × ${out.height}` }))
              .catch(() => toast("Captured", { description: "Press ⌘C / Ctrl C to copy it." }));
          // The clipboard only takes writes from the window in front, so wait until you're back.
          if (document.hasFocus()) copyNow();
          else window.addEventListener("focus", copyNow, { once: true });
        }
        if (s.after === "save" || s.after === "both") {
          encode(out, s.format, s.quality).then(async (blob) => {
            const fname = fileName(s.pattern, { width: out.width, height: out.height, ext: s.format });
            const result = await deliver({ saveTo: s.saveTo, folder, name: fname, blob });
            if (result.where !== "browser") toast.success(`Saved ${savedWhere(result, folder)}`);
          });
        }
      }, 50);
    },
    [s, folder],
  );

  const openFile = useCallback(
    async (file, source = "File") => {
      if (!file?.type?.startsWith("image/")) return toast.error("That isn't an image");
      try {
        await open(await blobToCanvas(file), { source, auto: false });
      } catch (error) {
        toast.error(error.message);
      }
    },
    [open],
  );

  const editItem = useCallback(async (item) => {
    try {
      const original = item.original ?? (await mediaBlob(item));
      const canvas = await blobToCanvas(original);
      const edits = item.original ? (item.edits ?? { shapes: [], crop: null }) : { shapes: [], crop: null };
      latest.current = edits;
      setBackdrop(item.original && item.backdrop ? item.backdrop : { ...DEFAULTS.backdrop, on: false });
      setDoc({ id: item.id, base: canvas, original, dpr: item.dpr ?? 1, name: item.name, ...edits });
      setTab("editor");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error("Couldn't open it", { description: error?.message });
    }
  }, []);

  // ---- Screen capture ----
  const waitFor = (kind, seconds) =>
    new Promise((resolve, reject) => {
      const done = (fn) => {
        window.removeEventListener("blur", onLeave);
        document.removeEventListener("visibilitychange", onLeave);
        clearInterval(timer);
        cancelWait.current = null;
        setWaiting(null);
        fn();
      };
      let timer = null;
      const onLeave = () => {
        if (document.hasFocus() && document.visibilityState === "visible") return;
        // Let the switch animation finish first.
        setTimeout(() => done(resolve), 350);
        window.removeEventListener("blur", onLeave);
        document.removeEventListener("visibilitychange", onLeave);
      };
      cancelWait.current = () => done(() => reject(cancelled()));
      if (kind === "leave") {
        setWaiting({ kind });
        window.addEventListener("blur", onLeave);
        document.addEventListener("visibilitychange", onLeave);
        if (!document.hasFocus()) onLeave();
      } else {
        let left = seconds;
        setWaiting({ kind, left });
        timer = setInterval(() => {
          left -= 1;
          if (left <= 0) {
            setWaiting({ kind, left: 0 });
            // Give the countdown chip a frame to disappear.
            setTimeout(() => done(resolve), 120);
            clearInterval(timer);
          } else setWaiting({ kind, left });
        }, 1000);
      }
    });

  const capture = async (mode) => {
    if (capturing.current) return;
    if (mode === "repeat" && !s.lastArea) return toast("Capture an area first", { description: "Repeat takes the same area again." });
    capturing.current = true;
    const title = document.title;
    let stream;
    try {
      const surface = mode === "window" ? "window" : "monitor";
      ({ stream } = await screenStream({ surface, keep: s.keep }));
      if (s.keep) {
        setSharing(true);
        stream.getVideoTracks()[0].addEventListener("ended", () => setSharing(false), { once: true });
      }
      const got = stream.getVideoTracks()[0].getSettings?.().displaySurface ?? surface;
      if (mode === "delayed") await waitFor("delay", s.delay);
      else if (got === "monitor" && s.when === "leave") await waitFor("leave");
      else await sleep(s.keep ? 60 : 280);
      const { canvas } = await grabFrame(stream);
      const dpr = window.devicePixelRatio || 1;
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        document.title = "● Captured — back to Screenshotr";
        if (s.sound) shutter();
      }
      if (mode === "area" || mode === "delayed") {
        setSelecting({ canvas, dpr });
      } else if (mode === "repeat") {
        const a = s.lastArea;
        const k = canvas.width / a.fw;
        await open(cropCanvas(canvas, { x: a.x * k, y: a.y * k, w: a.w * k, h: a.h * k }), { dpr, source: "Area" });
      } else {
        await open(canvas, { dpr, source: mode === "window" ? "Window" : "Screen" });
      }
    } catch (error) {
      if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") toast.error("Couldn't capture the screen", { description: error?.message });
    } finally {
      if (stream && !s.keep) stream.getTracks().forEach((track) => track.stop());
      capturing.current = false;
      const restore = () => {
        document.title = title;
        window.removeEventListener("focus", restore);
      };
      if (document.hasFocus()) restore();
      else window.addEventListener("focus", restore);
    }
  };

  const onArea = async (rect) => {
    const shot = selecting;
    setSelecting(null);
    if (!rect || !shot) return;
    set({ lastArea: { ...rect, fw: shot.canvas.width, fh: shot.canvas.height } });
    await open(cropCanvas(shot.canvas, rect), { dpr: shot.dpr, source: "Area" });
  };

  const paste = async () => {
    try {
      const blob = await clipboardImage();
      if (!blob) return toast("No picture on the clipboard", { description: "Copy an image or take a screenshot first." });
      await openFile(blob, "Pasted");
    } catch (error) {
      toast.error(error?.name === "NotAllowedError" ? "The browser didn't allow reading the clipboard" : error.message);
    }
  };

  // ---- Page shortcuts, paste and drop ----
  const keys = useRef(null);
  useEffect(() => {
    keys.current = (event) => {
      if (selecting || isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.altKey && event.shiftKey && !mod) {
        const mode = { KeyA: "area", KeyF: "full", KeyW: "window", KeyD: "delayed", KeyR: "repeat" }[event.code];
        if (mode) {
          event.preventDefault();
          capture(mode);
        }
        return;
      }
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        fileInput.current?.click();
      }
      if (event.key === "Escape" && waiting) cancelWait.current?.();
    };
  });
  useEffect(() => {
    const onKey = (event) => keys.current?.(event);
    const onPaste = (event) => {
      if (isTyping(event.target)) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      openFile(file, "Pasted");
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [openFile]);

  // ---- Companion extension ----
  const onExtension = useRef(null);
  useEffect(() => {
    const pages = new Map();
    onExtension.current = async (data) => {
      try {
        if (data.kind === "visible") {
          const canvas = await urlToCanvas(data.url);
          await open(canvas, { dpr: data.viewWidth ? canvas.width / data.viewWidth : 1, source: "Tab" });
        } else if (data.kind === "area") {
          const canvas = await urlToCanvas(data.url);
          const k = data.viewWidth ? canvas.width / data.viewWidth : 1;
          const r = data.rect;
          set({ lastArea: null });
          await open(cropCanvas(canvas, { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }), { dpr: k, source: "Tab area" });
        } else if (data.kind === "page-start") {
          pages.set(data.id, { meta: data, frames: [] });
          toast.loading("Joining the page…", { id: data.id });
        } else if (data.kind === "page-frame") {
          pages.get(data.id)?.frames.push(data.frame);
        } else if (data.kind === "page-end") {
          const page = pages.get(data.id);
          pages.delete(data.id);
          if (!page?.frames.length) return toast.dismiss(data.id);
          const { canvas, dpr } = await stitch({ frames: page.frames, height: page.meta.height, viewWidth: page.meta.viewWidth });
          toast.success(`Whole page · ${page.frames.length} screens`, {
            id: data.id,
            description: page.meta.cut ? "The page was very long, so only the top part was captured." : page.meta.title,
          });
          await open(canvas, { dpr, source: "Page" });
        }
      } catch (error) {
        toast.error("Couldn't open the capture", { description: error?.message });
      }
    };
  });
  useEffect(() => {
    const post = (type) => window.postMessage({ [SHOT_TAG]: type }, window.location.origin);
    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data[SHOT_TAG] === "extension") setExtension(data.version || "1");
      if (data[SHOT_TAG] === "capture" && data.data) onExtension.current?.(data.data);
    };
    window.addEventListener("message", onMessage);
    post("page-ready");
    return () => {
      post("page-gone");
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => () => stopSharing(), []);

  const onModel = useCallback(
    (model) => {
      latest.current = model;
      scheduleSave();
    },
    [scheduleSave],
  );
  const toggleKeep = (keep) => {
    set({ keep });
    if (!keep) {
      stopSharing();
      setSharing(false);
    }
  };

  const alt = isMac ? "⌥⇧" : "Alt+Shift+";
  const mod = isMac ? "⌘" : "Ctrl+";
  // The editor previews this screenshot's own backdrop, not the default for new ones.
  const editorSettings = useMemo(() => ({ ...s, backdrop }), [s, backdrop]);
  const editorActions = useMemo(() => ({ copy, save, pin, ocr: readScreenshot, toggleBackdrop }), [copy, save, pin, readScreenshot, toggleBackdrop]);

  return (
    <Page className="max-w-[120rem]">
      <ToolHeader icon="shot" title="Screenshotr" description="Capture an area, a window or the whole screen, annotate it, then copy, save, pin it on top or pull the text out." />

      {/* Capture bar */}
      <div
        className="mt-5 flex flex-wrap items-center gap-2"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
          if (file) openFile(file);
        }}
      >
        <CaptureButton icon={Crosshair} label="Area" keys={`${alt}A`} onClick={() => capture("area")} primary />
        <CaptureButton icon={Monitor} label="Full screen" keys={`${alt}F`} onClick={() => capture("full")} />
        <CaptureButton icon={AppWindow} label="Window" keys={`${alt}W`} onClick={() => capture("window")} />
        <CaptureButton icon={Timer} label={`In ${s.delay}s`} keys={`${alt}D · then pick an area`} onClick={() => capture("delayed")} />
        <CaptureButton icon={Repeat} label="Repeat area" keys={`${alt}R`} onClick={() => capture("repeat")} disabled={!s.lastArea} />
        <span className="mx-1 hidden h-6 w-px bg-grid sm:block" />
        <CaptureButton icon={ClipboardPaste} label="Paste" keys={`${mod}V`} onClick={paste} />
        <CaptureButton icon={ImagePlus} label="Open" keys={`${mod}O · or drop an image`} onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) openFile(file);
          }}
        />
        <label className="ml-auto flex h-10 items-center gap-2 rounded-xl px-2 text-sm text-ink-2">
          <Switch checked={s.keep} onCheckedChange={toggleKeep} aria-label="Keep the screen shared" />
          Keep screen shared
        </label>
        {sharing && s.keep && (
          <button
            type="button"
            onClick={() => {
              stopSharing();
              setSharing(false);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 text-xs font-semibold text-danger hover:bg-danger-soft/70"
          >
            <span className="size-2 rounded-full bg-danger" />
            Sharing · Stop
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Section"
          className={TOUCH_SEGMENTS}
          value={tab}
          onChange={setTab}
          options={[
            { value: "editor", label: "Editor" },
            { value: "settings", label: "Settings" },
            { value: "launch", label: "Extension", dot: extension ? "active" : undefined },
          ]}
        />
        {pins > 0 && (
          <button type="button" onClick={unpinAll} className="flex h-8 items-center gap-1.5 rounded-lg bg-hover px-2.5 text-xs font-semibold hover:bg-selected">
            <Pin className="size-[1.3rem]" />
            {pins} pinned · Unpin all
          </button>
        )}
      </div>

      <div className="mt-3">
        {tab === "editor" &&
          (doc ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <Editor key={doc.id} doc={doc} settings={editorSettings} onSettings={set} onModel={onModel} actions={editorActions} active={!selecting && !ocr} />
              <aside className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:w-[22rem]">
                <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-2 shadow-card">
                  <ActionButton icon={Copy} label="Copy" keys={`${mod}C`} onClick={copy} primary />
                  <ActionButton icon={Save} label={s.saveTo === "folder" && folder.handle ? `Save to “${folder.handle.name}”` : s.saveTo === "browser" ? "Save in browser" : "Save to Downloads"} keys={`${mod}S`} onClick={save} />
                  <ActionButton icon={Pin} label={canPinOnTop() ? "Pin on top" : "Pin in a window"} keys="⇧P" onClick={pin} />
                  <ActionButton icon={ScanText} label={canReadCodes() ? "Copy text & QR codes" : "Copy text"} keys="⇧T" onClick={readScreenshot} busy={ocr?.busy} />
                </div>
                <div className="rounded-2xl bg-surface p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Backdrop</p>
                    <span className="flex items-center gap-2 text-2xs text-ink-3">
                      ⇧B
                      <Switch checked={backdrop.on} onCheckedChange={(on) => setBackdrop((b) => ({ ...b, on }))} aria-label="Backdrop" />
                    </span>
                  </div>
                  {backdrop.on && (
                    <div className="mt-3">
                      <BackdropControls value={backdrop} onChange={setBackdrop} compact />
                      <button type="button" onClick={() => set({ backdrop })} className="mt-2 text-xs font-semibold text-ink-3 hover:text-ink">
                        Use for new screenshots
                      </button>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-surface px-3 shadow-card">
                  <SaveLocation value={s.saveTo} onChange={(saveTo) => set({ saveTo })} folder={folder} what="screenshots" compact />
                </div>
                <p className="px-1 text-xs text-ink-3 tabular-nums">
                  {doc.base.width} × {doc.base.height}
                  {doc.dpr > 1 ? ` · ${Math.round(doc.dpr * 10) / 10}× screen` : ""} · edits are kept in the history
                </p>
              </aside>
            </div>
          ) : (
            <Empty isMac={isMac} onArea={() => capture("area")} onPaste={paste} onOpen={() => fileInput.current?.click()} extension={extension} onExtension={() => setTab("launch")} />
          ))}
        {tab === "settings" && <ShotSettings s={s} set={set} folder={folder} isMac={isMac} />}
        {tab === "launch" && <ShotLaunch extension={extension} isMac={isMac} />}
      </div>

      <MediaLibrary
        title="Screenshots"
        items={items}
        setItems={setItems}
        kinds={["image"]}
        empty="Screenshots you take are kept here, with their edits, in this browser only."
        itemAction={{ label: "Edit", hint: "Open in the editor", icon: <Pencil className="size-[1.3rem]" />, onClick: editItem }}
      />

      {selecting && <AreaSelect canvas={selecting.canvas} loupe={s.loupe} confirm={s.areaConfirm} onDone={onArea} />}

      {waiting && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-sm font-medium text-ground shadow-float animate-rise">
          {waiting.kind === "leave" ? (
            <span>Switch to the app or window you want — the picture is taken as you leave this tab.</span>
          ) : (
            <span className="tabular-nums">Capturing in {waiting.left}…</span>
          )}
          <button type="button" onClick={() => cancelWait.current?.()} className="flex h-8 items-center gap-1 rounded-lg bg-ground/15 px-2.5 text-xs font-semibold hover:bg-ground/25">
            <X className="size-[1.3rem]" />
            Cancel · Esc
          </button>
        </div>
      )}

      <Dialog open={Boolean(ocr)} onOpenChange={(value) => !value && setOcr(null)} title="Text in the screenshot" description={ocr?.busy ? `${ocr.step}… ${Math.round(ocr.progress * 100)}%` : "Copied to the clipboard. Edit it here if you need to."}>
        {ocr?.busy ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${Math.max(4, ocr.progress * 100)}%` }} />
          </div>
        ) : (
          ocr && (
            <div className="flex flex-col gap-3">
              {ocr.codes.map((code) => (
                <div key={code.value} className="flex items-center gap-2 rounded-xl bg-data-soft px-3 py-2 text-sm">
                  <span className="text-2xs font-semibold text-data uppercase">{code.format.replace("_", " ")}</span>
                  {/^https?:\/\//.test(code.value) ? (
                    <a href={code.value} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate font-medium underline">
                      {code.value}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-medium">{code.value}</span>
                  )}
                  <button type="button" onClick={() => navigator.clipboard?.writeText(code.value).then(() => toast.success("Copied"))} className="h-7 rounded-md bg-surface px-2 text-xs font-semibold shadow-card">
                    Copy
                  </button>
                </div>
              ))}
              <textarea
                value={ocr.text}
                onChange={(event) => setOcr({ ...ocr, text: event.target.value })}
                placeholder="No text found."
                className="h-72 w-full resize-y rounded-xl bg-sunken p-3 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ink/20"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOcr(null)} className="h-9 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:bg-hover">
                  Close
                </button>
                <button
                  type="button"
                  disabled={!ocr.text}
                  onClick={() => navigator.clipboard?.writeText(ocr.text).then(() => toast.success("Text copied"))}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-ground hover:bg-ink/85 disabled:opacity-40"
                >
                  <Copy className="size-[1.4rem]" />
                  Copy text
                </button>
              </div>
            </div>
          )
        )}
      </Dialog>
    </Page>
  );
}

function Empty({ isMac, onArea, onPaste, onOpen, extension, onExtension }) {
  const alt = isMac ? "⌥ ⇧" : "Alt Shift";
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface px-6 py-14 text-center shadow-card">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-data-soft text-data">
        <Crosshair className="size-[2.4rem]" />
      </span>
      <div>
        <p className="text-base font-semibold">Take a screenshot to start</p>
        <p className="mt-1 max-w-[46rem] text-sm text-ink-3">
          Press <b>{alt} A</b> for an area, or paste (<b>{isMac ? "⌘" : "Ctrl"} V</b>) or drop any image to annotate it. Arrows, boxes, text, numbered steps, blur, smart erase, spotlight,
          a ruler and a colour picker are all one key away.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onArea} className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-ground hover:bg-ink/85">
          <Crosshair className="size-[1.6rem]" />
          Capture an area
        </button>
        <button type="button" onClick={onPaste} className="flex h-10 items-center gap-2 rounded-xl bg-hover px-4 text-sm font-semibold hover:bg-selected">
          <ClipboardPaste className="size-[1.6rem]" />
          Paste
        </button>
        <button type="button" onClick={onOpen} className="flex h-10 items-center gap-2 rounded-xl bg-hover px-4 text-sm font-semibold hover:bg-selected">
          <FolderOpen className="size-[1.6rem]" />
          Open a file
        </button>
      </div>
      {!extension && (
        <button type="button" onClick={onExtension} className="text-xs font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline">
          Capture other tabs with one key — get the extension
        </button>
      )}
    </div>
  );
}
