"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/tools/files";
import { newId, saveMedia, stamp, thumbnail } from "@/lib/tools/media-store";
import { startJournal } from "@/lib/tools/recording-journal";
import { deliver, freeName, savedWhere } from "@/lib/tools/save-folder";
import {
  AudioMixer,
  bitrateFor,
  canCaptureScreen,
  CAM_SCALES,
  Compositor,
  extensionFor,
  fixWebmDuration,
  FrameSource,
  getCamera,
  getDisplay,
  getMic,
  pickType,
  stopStream,
  Ticker,
} from "@/lib/tools/screen/capture";
import { mapInput, TUTORIAL_DEFAULTS, TutorialFx } from "@/lib/tools/screen/tutorial";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const camOptions = (cfg) => ({
  position: cfg.camPosition,
  scale: cfg.camScale ?? CAM_SCALES[cfg.camSize] ?? CAM_SCALES.m,
  shape: cfg.camShape === "rect" ? "wide" : cfg.camShape,
  mirror: cfg.camMirror,
  zoom: cfg.camZoom,
  filter: cfg.camFilter,
  border: cfg.camBorder,
  borderColor: cfg.camBorderColor,
  borderWidth: cfg.camBorderWidth,
  shadow: cfg.camShadow,
  label: cfg.camLabel,
});
export const markOptions = (cfg, logo) => ({
  kind: cfg.mark === "image" && !logo ? "off" : cfg.mark,
  text: cfg.markText,
  bitmap: logo,
  position: cfg.markPosition,
  size: cfg.markSize,
  opacity: cfg.markOpacity,
});

export const tutorialOptions = (cfg) => Object.fromEntries(Object.keys(TUTORIAL_DEFAULTS).map((key) => [key, cfg[key] ?? TUTORIAL_DEFAULTS[key]]));

function cancelled(error) {
  return error?.name === "NotAllowedError" || error?.name === "AbortError";
}

function elapsedOf(s) {
  if (!s?.startedAt) return 0;
  return (s.pausedAt ?? performance.now()) - s.startedAt - s.pausedTotal;
}

export function useScreenRecorder({ settings, logo, folder, onSaved }) {
  const [phase, setPhase] = useState("idle");
  const [clock, setClock] = useState({ elapsed: 0, bytes: 0 });
  const [countdown, setCountdown] = useState(0);
  const [preview, setPreview] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [info, setInfo] = useState(null);
  const session = useRef(null);
  const latest = useRef({ settings, logo, folder, onSaved });

  useEffect(() => {
    latest.current = { settings, logo, folder, onSaved };
  });

  const cleanup = useCallback((s) => {
    s.ticker?.stop();
    s.compositor?.stop();
    s.snap?.close();
    s.snapTrack?.stop();
    stopStream(s.display);
    stopStream(s.camera);
    stopStream(s.mic);
    s.mixer?.close();
    if (session.current === s) session.current = null;
    setPreview(null);
    setSelecting(null);
    setCountdown(0);
  }, []);

  const currentFrame = (s) => {
    if (s?.compositor) return { image: s.compositor.canvas, width: s.compositor.canvas.width, height: s.compositor.canvas.height };
    if (s?.snap?.width) return { image: s.snap.image, width: s.snap.width, height: s.snap.height };
    return null;
  };

  const finish = useCallback(
    async (s) => {
      const { folder: dir, onSaved: saved } = latest.current;
      const duration = s.endElapsed ?? elapsedOf(s);
      const frame = currentFrame(s);
      if (!s.thumb && frame) s.thumb = thumbnail(frame.image, frame.width, frame.height);
      cleanup(s);

      const mime = s.type.split(";")[0] || (s.hasVideo ? "video/webm" : "audio/webm");
      let blob = null;
      let handle = null;
      if (s.writer) {
        await s.writeChain;
        try {
          await s.writer.close();
          if (!s.writeError) handle = s.fileHandle;
        } catch {}
      }
      if (!handle) {
        blob = await fixWebmDuration(new Blob(s.chunks, { type: mime }), duration);
        if (s.writeError) toast.error("Couldn't keep writing to the folder — saved the part still in memory");
      }
      if (!blob?.size && !handle) {
        s.journal?.discard();
        setPhase("idle");
        return toast.error("Nothing was recorded");
      }

      const item = {
        id: newId(),
        tool: "screen",
        kind: s.hasVideo ? "video" : "audio",
        name: s.name,
        mime,
        size: blob?.size ?? s.bytes,
        duration: duration / 1000,
        width: s.width,
        height: s.height,
        createdAt: Date.now(),
        blob,
        handle,
        thumb: s.thumb,
      };
      try {
        await saveMedia(item);
      } catch {
        if (blob) downloadBlob(blob, s.name);
        toast.error("Browser storage is full — the recording was downloaded instead");
      }
      // Saved for good, so the crash-safe copy can go.
      s.journal?.discard();
      let where = { where: "folder" };
      if (blob && !handle) where = await deliver({ saveTo: s.saveTo, folder: dir, name: s.name, blob });
      saved?.(item);
      setPhase("idle");
      setClock({ elapsed: 0, bytes: 0 });
      toast.success(s.hasVideo ? "Recording saved" : "Audio saved", { description: `${s.name} · ${savedWhere(where, dir)}` });
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    const s = session.current;
    if (!s) return;
    if (s.recorder && s.recorder.state !== "inactive") {
      if (s.pausedAt) {
        s.pausedTotal += performance.now() - s.pausedAt;
        s.pausedAt = null;
      }
      s.endElapsed = elapsedOf(s);
      setPhase("saving");
      s.ticker?.stop();
      s.recorder.stop();
      return;
    }
    s.cancelled = true;
    cleanup(s);
    setPhase("idle");
  }, [cleanup]);

  const tick = useCallback(
    (s) => {
      if (session.current !== s || !s.recorder) return;
      const cfg = latest.current.settings;
      const elapsed = elapsedOf(s);
      setClock({ elapsed, bytes: s.bytes });
      if (!s.thumb && elapsed > 700) {
        const frame = currentFrame(s);
        if (frame) s.thumb = thumbnail(frame.image, frame.width, frame.height);
        if (s.thumb) s.journal?.update({ thumb: s.thumb });
      }
      if (cfg.autoStop === "time" && elapsed >= cfg.autoStopMinutes * 60000) stop();
      if (cfg.autoStop === "size" && s.bytes >= cfg.autoStopMb * 1024 * 1024) stop();
    },
    [stop],
  );

  const begin = useCallback(
    async (s) => {
      const { settings: cfg, logo: mark, folder: dir } = latest.current;
      const audioOnly = cfg.mode === "audio";
      const main = audioOnly ? null : (s.display ?? s.camera)?.getVideoTracks()[0];
      const overlayCamera = s.display && s.camera ? s.camera.getVideoTracks()[0] : null;
      const maxHeight = cfg.resolution === "original" ? 0 : Number(cfg.resolution);
      const markOn = markOptions(cfg, mark).kind !== "off" && (cfg.mark !== "text" || cfg.markText.trim());
      const type = pickType(cfg.format, Boolean(main));
      // A shared window or tab changes size when the user resizes it. Chrome's MP4 (avc1) writer can't follow a
      // size change: everything after it comes out garbled. Drawing through a fixed-size canvas keeps the video
      // one size and letterboxes the resized picture, like a desktop recorder does. WebM copes on its own.
      const fixedSize = Boolean(s.display) && type.startsWith("video/mp4");
      // Tutorial mode draws zooms, the lens and drawings into the picture, so it always goes through the canvas.
      const composite = main && (s.crop || overlayCamera || markOn || fixedSize || cfg.tutorial);

      let videoTrack = null;
      if (main) {
        if (composite) {
          s.compositor = new Compositor({
            main,
            camera: overlayCamera,
            fps: cfg.fps,
            maxHeight,
            crop: s.crop,
            cam: overlayCamera ? camOptions(cfg) : null,
            mark: markOn ? markOptions(cfg, mark) : null,
            fx: cfg.tutorial ? new TutorialFx(tutorialOptions(cfg)) : null,
          });
          videoTrack = await s.compositor.start();
          s.width = s.compositor.canvas.width;
          s.height = s.compositor.canvas.height;
        } else {
          if (maxHeight) await main.applyConstraints({ height: { max: maxHeight }, frameRate: { max: cfg.fps } }).catch(() => {});
          videoTrack = main;
          s.snapTrack = main.clone();
          s.snap = new FrameSource(s.snapTrack);
          await Promise.race([s.snap.ready, wait(1500)]);
          const set = main.getSettings();
          s.width = s.snap.width || set.width;
          s.height = s.snap.height || set.height;
        }
      }
      if (s.cancelled) return;

      s.mixer.add("system", s.display, cfg.systemGain);
      s.mixer.add("mic", s.mic, cfg.mic ? cfg.micGain : 0);
      const audioTrack = s.mixer.track;
      if (cfg.systemAudio && s.display && !s.mixer.has("system")) {
        toast("No computer sound in this recording", { description: "Tick “Share audio” in the browser's picker to include it." });
      }
      if (!videoTrack && !audioTrack) {
        cleanup(s);
        setPhase("idle");
        return toast.error("Nothing to record — turn on the microphone or computer sound");
      }

      setPreview(videoTrack ? new MediaStream([s.compositor ? videoTrack : main]) : null);
      s.hasVideo = Boolean(videoTrack);
      s.type = s.hasVideo ? type : pickType(cfg.format, false);
      setInfo({ width: s.width, height: s.height, fps: cfg.fps, type: s.type, composite: Boolean(composite), camera: Boolean(overlayCamera && s.compositor), tutorial: Boolean(s.compositor?.fx) });

      for (let n = cfg.countdown; n > 0; n -= 1) {
        setPhase("countdown");
        setCountdown(n);
        await wait(1000);
        if (s.cancelled) return;
      }
      setCountdown(0);

      const out = new MediaStream([videoTrack, audioTrack].filter(Boolean));
      let recorder;
      try {
        recorder = new MediaRecorder(out, {
          mimeType: s.type || undefined,
          videoBitsPerSecond: s.hasVideo ? bitrateFor(s.width, s.height, cfg.fps, cfg.quality) : undefined,
          audioBitsPerSecond: 192000,
          // Chrome's MP4 writer only hands over data at keyframes. Without regular ones it keeps the whole
          // recording in memory until stop: no live size, no size limit, nothing streamed to the folder.
          ...(s.hasVideo ? { videoKeyFrameIntervalDuration: 2000 } : {}),
        });
      } catch {
        cleanup(s);
        setPhase("idle");
        return toast.error("This browser can't record in that format. Try switching between MP4 and WebM.");
      }
      s.type = recorder.mimeType || s.type;
      s.name = `${cfg.prefix || "Recording"} ${stamp()}.${extensionFor(s.type)}`;
      s.chunks = [];
      s.bytes = 0;
      s.writeChain = Promise.resolve();

      // A copy of every chunk goes to browser storage as it arrives, so a refresh or crash can't lose the recording.
      // (A folder file is only committed when it's closed, so it needs this too.)
      s.journal = await startJournal({
        tool: "screen",
        kind: s.hasVideo ? "video" : "audio",
        name: s.name,
        mime: s.type.split(";")[0] || (s.hasVideo ? "video/webm" : "audio/webm"),
        width: s.width,
        height: s.height,
      }).catch(() => null);
      if (s.cancelled) {
        s.journal?.discard();
        return;
      }

      s.saveTo = cfg.saveTo;
      if (cfg.saveTo === "folder" && dir?.handle && dir.permission === "granted") {
        try {
          s.name = await freeName(dir.handle, s.name);
          s.fileHandle = await dir.handle.getFileHandle(s.name, { create: true });
          s.writer = await s.fileHandle.createWritable();
        } catch {
          s.writer = null;
        }
      }

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        s.bytes += event.data.size;
        s.journal?.append(event.data, elapsedOf(s));
        if (s.writer && !s.writeError) {
          s.writeChain = s.writeChain
            .then(() => s.writer.write(event.data))
            .catch((error) => {
              s.writeError = error;
              s.chunks.push(event.data);
            });
        } else {
          s.chunks.push(event.data);
        }
      };
      recorder.onstop = () => finish(s);
      recorder.onerror = (event) => {
        toast.error("Recording stopped unexpectedly", { description: event.error?.message });
      };

      s.recorder = recorder;
      recorder.start(1000);
      s.startedAt = performance.now();
      s.pausedTotal = 0;
      s.pausedAt = null;
      s.ticker = new Ticker(250, () => tick(s));
      setPhase("recording");
    },
    [cleanup, finish, tick],
  );

  /** Opens the sources for the current mode. The area mode then waits for a selection. */
  const record = useCallback(
    async ({ area } = {}) => {
      const current = session.current;
      if (current && phase === "selecting") {
        current.crop = area && (area.w < 0.999 || area.h < 0.999) ? area : null;
        setSelecting(null);
        return begin(current);
      }
      if (current) return;

      const cfg = latest.current.settings;
      const s = { pausedTotal: 0, mixer: new AudioMixer() };
      session.current = s;
      setPhase("acquiring");
      try {
        if (cfg.mode === "webcam") {
          s.camera = await getCamera({ deviceId: cfg.camId, fps: cfg.fps });
        } else if (cfg.mode !== "audio" || (cfg.systemAudio && canCaptureScreen())) {
          s.display = await getDisplay({ mode: cfg.mode === "audio" ? "tab" : cfg.mode, fps: cfg.fps, systemAudio: cfg.systemAudio });
          if (cfg.mode !== "audio" && cfg.cam) {
            s.camera = await getCamera({ deviceId: cfg.camId, fps: cfg.fps }).catch(() => {
              toast.error("Couldn't open the webcam — recording without it");
              return null;
            });
          }
        }
        if (cfg.mic) {
          s.mic = await getMic({ deviceId: cfg.micId, noiseSuppression: cfg.micClean }).catch(() => {
            toast.error("Couldn't open the microphone — recording without it");
            return null;
          });
        }
      } catch (error) {
        cleanup(s);
        setPhase("idle");
        if (!cancelled(error)) toast.error("Couldn't start recording", { description: error?.message });
        return;
      }
      if (s.cancelled) return cleanup(s);

      const ended = () => {
        if (session.current === s) stop();
      };
      (s.display ?? s.camera)?.getVideoTracks()[0]?.addEventListener("ended", ended);

      if (cfg.mode === "area") {
        setSelecting(s.display);
        setPhase("selecting");
        return;
      }
      await begin(s);
    },
    [begin, cleanup, phase, stop],
  );

  const togglePause = useCallback(() => {
    const s = session.current;
    if (!s?.recorder) return;
    if (s.recorder.state === "recording") {
      s.recorder.pause();
      s.pausedAt = performance.now();
      setPhase("paused");
    } else if (s.recorder.state === "paused") {
      s.pausedTotal += performance.now() - s.pausedAt;
      s.pausedAt = null;
      s.recorder.resume();
      setPhase("recording");
    }
    setClock({ elapsed: elapsedOf(s), bytes: s.bytes });
  }, []);

  // Live changes while recording: volume, muting the mic, webcam bubble and watermark.
  useEffect(() => {
    const mixer = session.current?.mixer;
    if (!mixer) return;
    mixer.setGain("system", settings.systemGain);
    mixer.setGain("mic", settings.mic ? settings.micGain : 0);
  }, [settings.systemGain, settings.micGain, settings.mic]);

  useEffect(() => {
    const compositor = session.current?.compositor;
    if (!compositor) return;
    compositor.update({
      cam: compositor.camera && settings.cam ? camOptions(settings) : null,
      mark: compositor.mark || settings.mark !== "off" ? markOptions(settings, logo) : null,
    });
    compositor.fx?.update(tutorialOptions(settings));
  }, [settings, logo]);

  // Warn before closing the tab mid-recording, and show the timer in the tab title.
  const active = phase === "recording" || phase === "paused" || phase === "countdown";
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    const onUnload = (event) => event.preventDefault();
    // Leaving anyway: hand over the last part so it reaches the crash-safe copy.
    const onHide = () => {
      const recorder = session.current?.recorder;
      if (recorder?.state === "recording") recorder.requestData();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.title = original;
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onHide);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const total = Math.floor(clock.elapsed / 1000);
    const time = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    document.title = phase === "paused" ? `❚❚ ${time} · Paused` : phase === "countdown" ? `Starting in ${countdown}…` : `● ${time} · Recording`;
  }, [active, clock.elapsed, phase, countdown]);

  useEffect(
    () => () => {
      const s = session.current;
      if (!s) return;
      s.cancelled = true;
      if (s.recorder?.state !== "inactive") s.recorder?.stop();
      else cleanup(s);
    },
    [cleanup],
  );

  const level = useCallback((id) => session.current?.mixer?.level(id) ?? 0, []);

  /** The live tutorial effects, or null when the recording runs without tutorial mode. */
  const tutorial = useCallback(() => session.current?.compositor?.fx ?? null, []);

  /**
   * An event from the browser extension (a click, the typing caret, the mouse or a shortcut in a browser tab),
   * placed onto the recording. Ignored when the event's tab isn't what's being recorded.
   */
  const tutorialInput = useCallback((event) => {
    const s = session.current;
    const fx = s?.compositor?.fx;
    if (!fx || s.recorder?.state !== "recording") return;
    if (event.type === "key") return fx.key(event.label);
    const track = s.display?.getVideoTracks()[0];
    const surface = track?.getSettings().displaySurface;
    if (surface === "browser") {
      // The extension tags every tab with a capture handle, so a shared tab says which one it is.
      // Without one, trust the tab you're working in.
      const handle = track.getCaptureHandle?.()?.handle;
      if (handle ? event.handle !== handle : !event.focused) return;
    } else if (!event.focused) return;
    const frame = mapInput(event, surface);
    const at = frame && s.compositor.frameToOutput(frame.x, frame.y);
    if (!at) return;
    if (event.type === "click") fx.click(at.x, at.y);
    else if (event.type === "caret") fx.caret(at.x, at.y);
    else if (event.type === "move" && s.lensFollow) fx.pointer(at.x, at.y);
  }, []);

  /** Lens follows the mouse in browser tabs (via the extension) while the lens tool is on. */
  const setLensFollow = useCallback((on) => {
    const s = session.current;
    if (!s) return;
    s.lensFollow = on;
    if (!on) s.compositor?.fx?.lensAt(null);
  }, []);

  return { phase, clock, countdown, preview, selecting, info, record, stop, togglePause, level, tutorial, tutorialInput, setLensFollow };
}
