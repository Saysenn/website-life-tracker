"use client";

import {
  AppWindow,
  Camera,
  Crop,
  Film,
  FolderOpen,
  House,
  Image as ImageIcon,
  Keyboard,
  Mic,
  Monitor,
  PanelsTopLeft,
  PictureInPicture2,
  Stamp,
  Timer,
  Volume2,
  Webcam,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { useStoredState } from "@/hooks/use-stored-state";
import { formatBytes } from "@/lib/tools/files";
import { fmtClock, getSetting, listMedia, setSetting } from "@/lib/tools/media-store";
import { canCaptureScreen, extensionFor, formatSupport, listDevices } from "@/lib/tools/screen/capture";
import { cn } from "@/lib/utils";
import { MediaLibrary } from "../media-library";
import { ToolHeader } from "../tool-header";
import { AreaPicker, ASPECTS, DEFAULT_AREA, fitAspect } from "./area-picker";
import { canPopOut, openPopOut, PopOut } from "./mini-bar";
import { AudioPanel, HotkeysPanel, ImagePanel, LogoPanel, Meter, OutputPanel, TOUCH_SEGMENTS, VideoPanel, WebcamPanel } from "./panels";
import { useScreenRecorder } from "./use-screen-recorder";

const DEFAULTS = {
  mode: "screen",
  format: "mp4",
  resolution: "original",
  fps: 30,
  quality: "high",
  countdown: 3,
  autoStop: "off",
  autoStopMinutes: 10,
  autoStopMb: 500,
  systemAudio: true,
  systemGain: 1,
  mic: true,
  micId: "",
  micGain: 1,
  micClean: true,
  cam: false,
  camId: "",
  camPosition: "bottom-right",
  camSize: "m",
  camShape: "circle",
  camMirror: true,
  mark: "off",
  markText: "",
  markPosition: "bottom-right",
  markSize: "m",
  markOpacity: 0.8,
  imageFormat: "png",
  imageQuality: 0.92,
  clipboard: false,
  repeat: false,
  repeatSeconds: 5,
  prefix: "Recording",
  autoDownload: false,
  miniBar: true,
  hotkeys: true,
  area: null,
  areaAspect: "free",
};

const MODES = [
  { value: "screen", label: "Full screen", icon: Monitor, hint: "Record a whole display." },
  { value: "window", label: "Window", icon: AppWindow, hint: "Record one app window." },
  { value: "tab", label: "Browser tab", icon: PanelsTopLeft, hint: "Record a tab, with its sound on any computer." },
  { value: "area", label: "Area", icon: Crop, hint: "Pick a screen, then drag a rectangle to record just that part." },
  { value: "webcam", label: "Webcam", icon: Webcam, hint: "Record your camera, like a device recorder." },
  { value: "audio", label: "Audio only", icon: Mic, hint: "Record the microphone and/or a tab's sound, no video." },
];

// Modes that need the browser's screen picker, which phones and tablets don't have.
const SCREEN_MODES = new Set(["screen", "window", "tab", "area"]);

const TABS = [
  { value: "home", label: "Home", icon: House },
  { value: "video", label: "Video", icon: Film },
  { value: "audio", label: "Audio", icon: Volume2 },
  { value: "webcam", label: "Webcam", icon: Webcam },
  { value: "logo", label: "Logo", icon: Stamp },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "output", label: "Output", icon: FolderOpen },
  { value: "hotkeys", label: "Hotkeys", icon: Keyboard },
];

const noop = () => () => {};
let supportCache = null;
const getSupport = () => (supportCache ??= { ...formatSupport(), screen: canCaptureScreen(), folder: "showDirectoryPicker" in window, popOut: canPopOut() });
const serverSupport = { mp4: true, webm: true, screen: true, folder: false, popOut: false };
const getIsMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

function LivePreview({ stream, countdown }) {
  const video = useRef(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black">
      <video ref={video} autoPlay muted playsInline className="size-full object-contain" />
      {countdown > 0 && (
        <span key={countdown} className="absolute inset-0 flex animate-pop items-center justify-center bg-ink/40 text-[9.6rem] font-semibold text-white tabular-nums">
          {countdown}
        </span>
      )}
    </div>
  );
}

export function ScreenRecorder() {
  const [stored, setStored] = useStoredState("tools:screen-recorder", DEFAULTS);
  const cfg = useMemo(() => ({ ...DEFAULTS, ...stored }), [stored]);
  const set = useCallback((patch) => setStored((prev) => ({ ...DEFAULTS, ...prev, ...patch })), [setStored]);
  const support = useSyncExternalStore(noop, getSupport, () => serverSupport);
  const isMac = useSyncExternalStore(noop, getIsMac, () => false);

  const [tab, setTab] = useState("home");
  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState({ mics: [], cameras: [] });
  const [folder, setFolder] = useState({ handle: null, permission: null });
  const [logo, setLogo] = useState(null);
  const [area, setArea] = useState(cfg.area ?? DEFAULT_AREA);
  const [pip, setPip] = useState(null);

  const onSaved = useCallback((item) => setItems((list) => [item, ...list.filter((entry) => entry.id !== item.id)]), []);
  const folderState = useMemo(() => ({ ...folder, supported: support.folder }), [folder, support.folder]);
  const rec = useScreenRecorder({ settings: cfg, logo: logo?.bitmap ?? null, folder: folderState, onSaved });
  const { phase } = rec;
  const busy = phase !== "idle";
  const live = phase === "recording" || phase === "paused" || phase === "countdown";

  // On a phone there's no screen picker: start on the webcam instead of a mode that can't work.
  useEffect(() => {
    if (!support.screen && SCREEN_MODES.has(cfg.mode)) set({ mode: "webcam" });
  }, [support.screen, cfg.mode, set]);

  useEffect(() => {
    listMedia("screen").then(setItems).catch(() => {});
    getSetting("screen:folder")
      .then(async (handle) => {
        if (!handle) return;
        const permission = await handle.queryPermission?.({ mode: "readwrite" }).catch(() => "prompt");
        setFolder({ handle, permission });
      })
      .catch(() => {});
    getSetting("screen:logo")
      .then(async (blob) => {
        if (blob) setLogo({ bitmap: await createImageBitmap(blob), url: URL.createObjectURL(blob) });
      })
      .catch(() => {});
    const refresh = () => listDevices().then(setDevices);
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  useEffect(() => () => logo?.url && URL.revokeObjectURL(logo.url), [logo]);

  const allowDevices = async (kind) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: true } : { audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setDevices(await listDevices());
    } catch {
      toast.error(`Allow ${kind === "video" ? "camera" : "microphone"} access in the browser's address bar`);
    }
  };

  const pickFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: "screen-recorder", mode: "readwrite", startIn: "videos" });
      await setSetting("screen:folder", handle);
      setFolder({ handle, permission: "granted" });
      toast.success(`Saving recordings to “${handle.name}”`);
    } catch (error) {
      if (error?.name !== "AbortError") toast.error("Couldn't use that folder");
    }
  };

  const reconnectFolder = async () => {
    const permission = await folder.handle?.requestPermission({ mode: "readwrite" }).catch(() => "denied");
    setFolder((current) => ({ ...current, permission }));
  };

  const forgetFolder = () => {
    setSetting("screen:folder", undefined).catch(() => {});
    setFolder({ handle: null, permission: null });
  };

  const changeLogo = async (file) => {
    if (!file) {
      setSetting("screen:logo", undefined).catch(() => {});
      return setLogo(null);
    }
    try {
      const bitmap = await createImageBitmap(file);
      await setSetting("screen:logo", file);
      setLogo({ bitmap, url: URL.createObjectURL(file) });
    } catch {
      toast.error("Couldn't read that image");
    }
  };

  const changeAspect = (areaAspect) => {
    set({ areaAspect });
    const size = rec.selecting?.getVideoTracks()[0]?.getSettings();
    setArea((current) => fitAspect(current, areaAspect, size?.width, size?.height));
  };

  const primary = () => {
    if (phase === "idle") return rec.record();
    if (phase === "selecting") {
      set({ area });
      return rec.record({ area });
    }
    if (live) return rec.stop();
  };

  const shot = () => rec.screenshot({ area: phase === "selecting" ? area : undefined });

  // Hotkeys: Alt/Option + R record/stop, P pause, S screenshot.
  const keys = useRef({});
  useEffect(() => {
    keys.current = { primary, pause: rec.togglePause, shot, enabled: cfg.hotkeys };
  });
  const onKeyDown = useCallback((event) => {
    const { enabled, primary: go, pause, shot: snap } = keys.current;
    if (!enabled || !event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const action = { KeyR: go, KeyP: pause, KeyS: snap }[event.code];
    if (!action) return;
    event.preventDefault();
    action();
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const popOut = useCallback(async () => {
    try {
      const win = await openPopOut();
      win.addEventListener("pagehide", () => setPip(null), { once: true });
      setPip(win);
    } catch {
      toast("Click the pop-out button to open the floating recording bar");
    }
  }, []);

  // Open the floating bar as recording starts (where allowed), and close it when done.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (live && cfg.miniBar && support.popOut && !pip && !autoOpened.current) {
      autoOpened.current = true;
      openPopOut()
        .then((win) => {
          win.addEventListener("pagehide", () => setPip(null), { once: true });
          setPip(win);
        })
        .catch(() => {});
    }
    if (phase === "idle") {
      autoOpened.current = false;
      pip?.close();
    }
  }, [live, phase, cfg.miniBar, support.popOut, pip]);

  const mode = MODES.find((entry) => entry.value === cfg.mode) ?? MODES[0];
  const recLabel = phase === "selecting" ? "Record area" : live ? "Stop" : phase === "saving" ? "Saving" : "REC";

  return (
    <Page className="max-w-[120rem]">
      <ToolHeader icon="screen" title="Screen recorder" description="Record your screen, a window, a tab, an area or your webcam — with sound, webcam overlay, logo and screenshots." />

      {!support.screen && (
        <p className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          This browser can’t record the screen. Use Chrome, Edge, Firefox or Safari on a computer — webcam and audio recording still work here.
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl bg-surface shadow-card">
        {/* Mode bar + big REC, like a desktop recorder's top strip. */}
        <div className="flex flex-wrap items-stretch gap-2 bg-sunken/70 p-2">
          {/* Phones: all six modes in a 3×2 grid on their own row, actions full width below. */}
          <div role="radiogroup" aria-label="Recording mode" className="grid min-w-0 basis-full grid-cols-3 gap-1 sm:flex sm:flex-1 sm:basis-0 sm:overflow-x-auto">
            {MODES.map((entry) => {
              const active = entry.value === cfg.mode;
              const Icon = entry.icon;
              return (
                <Tooltip key={entry.value} label={entry.hint}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={busy || (!support.screen && SCREEN_MODES.has(entry.value))}
                    onClick={() => set({ mode: entry.value })}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium whitespace-nowrap sm:min-w-[7.6rem] text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none",
                      active ? "bg-surface text-ink shadow-card" : (busy || (!support.screen && SCREEN_MODES.has(entry.value))) && "opacity-40",
                    )}
                  >
                    <Icon className={cn("size-[2.2rem]", active && "text-danger")} strokeWidth={1.6} />
                    {entry.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          <div className="flex basis-full items-center gap-2 sm:basis-auto sm:pr-1">
            <Tooltip label={`Pause / resume (${isMac ? "⌥" : "Alt"}+P)`}>
              <button
                type="button"
                onClick={rec.togglePause}
                disabled={phase !== "recording" && phase !== "paused"}
                aria-label={phase === "paused" ? "Resume" : "Pause"}
                className={cn(
                  "flex size-12 items-center justify-center rounded-full bg-surface text-ink shadow-card transition-colors hover:bg-hover disabled:opacity-40",
                  phase === "paused" && "bg-warning-soft text-warning",
                )}
              >
                {phase === "paused" ? <span className="size-0 border-y-[0.8rem] border-l-[1.3rem] border-y-transparent border-l-current" /> : <span className="flex gap-1"><span className="h-5 w-1.5 rounded-sm bg-current" /><span className="h-5 w-1.5 rounded-sm bg-current" /></span>}
              </button>
            </Tooltip>
            <Tooltip label={`Screenshot (${isMac ? "⌥" : "Alt"}+S)`}>
              <button
                type="button"
                onClick={shot}
                disabled={phase === "acquiring" || phase === "saving" || (!support.screen && cfg.mode !== "webcam" && !live)}
                aria-label="Screenshot"
                className="flex size-12 items-center justify-center rounded-full bg-surface text-ink shadow-card transition-colors hover:bg-hover disabled:opacity-40"
              >
                <Camera className="size-[2rem]" />
              </button>
            </Tooltip>
            <Tooltip label={live ? `Stop and save (${isMac ? "⌥" : "Alt"}+R)` : `Start recording (${isMac ? "⌥" : "Alt"}+R)`}>
              <button
                type="button"
                onClick={primary}
                disabled={phase === "acquiring" || phase === "saving"}
                className={cn(
                  "flex h-14 min-w-[8.4rem] flex-1 items-center justify-center gap-2 rounded-full px-4 sm:flex-none text-base font-bold tracking-wide text-white shadow-card transition-[background-color,transform] active:scale-[0.97] disabled:opacity-60",
                  live ? "bg-ink hover:bg-ink/85" : "bg-danger hover:bg-danger/90",
                )}
              >
                {live ? <span className="size-3.5 rounded-[0.3rem] bg-danger" /> : <span className="size-3.5 rounded-full bg-white" />}
                {recLabel}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Status strip: time, size and what's being recorded. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <span className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", phase === "recording" ? "animate-pulse bg-danger" : phase === "paused" ? "bg-warning" : "bg-ink-4")} />
            <span className="font-mono text-lg font-semibold tabular-nums">{fmtClock(rec.clock.elapsed / 1000)}</span>
          </span>
          <span className="text-sm text-ink-3 tabular-nums">{formatBytes(rec.clock.bytes)}</span>
          <span className="min-w-0 basis-full text-xs text-ink-3 sm:flex-1 sm:basis-0 sm:truncate">
            {phase === "acquiring" && "Choose what to share in the browser's picker…"}
            {phase === "selecting" && "Drag on the preview to choose the area, then press Record area."}
            {phase === "countdown" && `Starting in ${rec.countdown}…`}
            {phase === "saving" && "Saving…"}
            {(phase === "recording" || phase === "paused") &&
              rec.info &&
              [rec.info.width && `${rec.info.width}×${rec.info.height}`, rec.info.width && `${rec.info.fps} fps`, extensionFor(rec.info.type).toUpperCase()].filter(Boolean).join(" · ")}
            {phase === "idle" && `${mode.label} · ${cfg.format.toUpperCase()} · ${cfg.fps} fps${cfg.mic ? " · mic" : ""}${cfg.systemAudio ? " · sound" : ""}${cfg.cam && cfg.mode !== "webcam" && cfg.mode !== "audio" ? " · webcam" : ""}`}
          </span>
          {live && support.popOut && !pip && (
            <button type="button" onClick={popOut} className="flex h-8 items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-semibold hover:bg-hover">
              <PictureInPicture2 className="size-[1.4rem]" />
              Pop out bar
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row">
          <nav aria-label="Settings" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:w-44 lg:shrink-0 lg:flex-col lg:px-2 lg:pt-1 lg:pb-3">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setTab(entry.value)}
                  aria-current={tab === entry.value ? "page" : undefined}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink",
                    tab === entry.value && "bg-sunken font-semibold text-ink",
                  )}
                >
                  <Icon className="size-[1.5rem]" />
                  {entry.label}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 px-4 pb-4 lg:pl-2">
            {tab === "home" && (
              <HomePanel
                canShare={support.screen}
                cfg={cfg}
                set={set}
                mode={mode}
                rec={rec}
                area={area}
                setArea={setArea}
                onAspect={changeAspect}
                isMac={isMac}
                onRecordArea={primary}
                onFullFrame={() => rec.record({ area: { x: 0, y: 0, w: 1, h: 1 } })}
              />
            )}
            {tab === "video" && <VideoPanel cfg={cfg} set={set} support={support} locked={busy} />}
            {tab === "audio" && <AudioPanel cfg={cfg} set={set} devices={devices} onAllow={() => allowDevices("audio")} level={rec.level} live={live} locked={busy} />}
            {tab === "webcam" && <WebcamPanel cfg={cfg} set={set} devices={devices} onAllow={() => allowDevices("video")} locked={busy} />}
            {tab === "logo" && <LogoPanel cfg={cfg} set={set} logoUrl={logo?.url} onLogo={changeLogo} />}
            {tab === "image" && <ImagePanel cfg={cfg} set={set} />}
            {tab === "output" && (
              <OutputPanel cfg={cfg} set={set} folder={folderState} onPickFolder={pickFolder} onReconnect={reconnectFolder} onForget={forgetFolder} count={items.length} />
            )}
            {tab === "hotkeys" && <HotkeysPanel cfg={cfg} set={set} isMac={isMac} />}
          </div>
        </div>
      </div>

      <MediaLibrary
        title="Recordings"
        items={items}
        setItems={setItems}
        empty="Your recordings and screenshots will show up here. They stay in this browser until you delete them."
      />

      <PopOut
        pip={pip}
        onKeyDown={onKeyDown}
        phase={phase}
        clock={rec.clock}
        countdown={rec.countdown}
        onPause={rec.togglePause}
        onStop={rec.stop}
        onShot={shot}
      />
    </Page>
  );
}

function Toggle({ icon: Icon, label, on, onClick, disabled, hint }) {
  return (
    <Tooltip label={hint}>
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-40",
          on ? "bg-ink text-ground hover:bg-ink/85" : "bg-sunken text-ink-3 hover:bg-hover hover:text-ink",
        )}
      >
        <Icon className="size-[1.5rem]" />
        {label}
      </button>
    </Tooltip>
  );
}

function HomePanel({ cfg, set, mode, rec, area, setArea, onAspect, isMac, canShare, onRecordArea, onFullFrame }) {
  const { phase } = rec;
  const live = phase === "recording" || phase === "paused" || phase === "countdown";
  const busy = phase !== "idle";
  const ModeIcon = mode.icon;
  const videoModes = cfg.mode !== "webcam" && cfg.mode !== "audio";

  return (
    <div className="flex flex-col gap-3">
      {phase === "selecting" && rec.selecting ? (
        <>
          <AreaPicker stream={rec.selecting} value={area} onChange={setArea} aspect={cfg.areaAspect} />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Aspect ratio" value={cfg.areaAspect} onChange={onAspect} options={ASPECTS} className={TOUCH_SEGMENTS} />
            <span className="flex-1" />
            <button type="button" onClick={rec.stop} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-3 hover:bg-hover hover:text-ink">
              <X className="size-[1.5rem]" />
              Cancel
            </button>
            <button type="button" onClick={onFullFrame} className="flex h-9 items-center rounded-lg bg-sunken px-3 text-sm font-medium hover:bg-hover">
              Whole picture
            </button>
            <button type="button" onClick={onRecordArea} className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3.5 text-sm font-semibold text-white hover:bg-danger/90">
              <span className="size-2.5 rounded-full bg-white" />
              Record area
            </button>
          </div>
        </>
      ) : rec.preview ? (
        <LivePreview stream={rec.preview} countdown={rec.countdown} />
      ) : live && !rec.preview ? (
        <div className="flex aspect-[3/1] w-full flex-col items-center justify-center gap-4 rounded-xl bg-sunken px-6">
          {rec.countdown > 0 ? (
            <span className="text-[6.4rem] font-semibold tabular-nums">{rec.countdown}</span>
          ) : (
            <>
              <Mic className="size-[3.2rem] text-danger" strokeWidth={1.5} />
              <div className="flex w-full max-w-[40rem] flex-col gap-2">
                {cfg.mic && <Meter read={() => rec.level("mic")} active={live} />}
                {cfg.systemAudio && <Meter read={() => rec.level("system")} active={live} />}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex aspect-[21/9] w-full flex-col items-center justify-center gap-3 rounded-xl bg-sunken px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface text-danger shadow-card">
            <ModeIcon className="size-[2.6rem]" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-base font-semibold">{phase === "acquiring" ? "Pick what to record in the browser's window…" : phase === "saving" ? "Saving your recording…" : mode.label}</p>
            <p className="mt-0.5 text-sm text-ink-3">{mode.hint}</p>
          </div>
          {phase === "idle" && (
            <p className="text-xs text-ink-3">
              Press <span className="font-semibold text-danger">REC</span>
              <span className="pointer-coarse:hidden">
                {" "}or <kbd className="rounded bg-surface px-1.5 py-0.5 font-sans text-2xs font-semibold shadow-card">{isMac ? "⌥ Option" : "Alt"} + R</kbd>
              </span>{" "}
              to start
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Toggle icon={Volume2} label="Computer sound" on={cfg.systemAudio && canShare} disabled={busy || cfg.mode === "webcam" || !canShare} onClick={() => set({ systemAudio: !cfg.systemAudio })} hint="Record what you hear from the shared screen or tab" />
        <Toggle icon={Mic} label={live && !cfg.mic ? "Mic muted" : "Microphone"} on={cfg.mic} disabled={phase === "acquiring" || phase === "saving"} onClick={() => set({ mic: !cfg.mic })} hint={live ? "Mute or unmute your mic" : "Record your voice"} />
        {videoModes && <Toggle icon={Webcam} label="Webcam" on={cfg.cam} disabled={busy} onClick={() => set({ cam: !cfg.cam })} hint="Show your camera in a corner" />}
        <Toggle
          icon={Timer}
          label={cfg.countdown ? `${cfg.countdown}s countdown` : "No countdown"}
          on={cfg.countdown > 0}
          disabled={busy}
          onClick={() => set({ countdown: cfg.countdown ? 0 : 3 })}
          hint="Wait a moment before recording starts"
        />
      </div>
    </div>
  );
}

