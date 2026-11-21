"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/tools/files";
import { newId, saveMedia, stamp, thumbnail } from "@/lib/tools/media-store";
import {
  AudioMixer,
  bitrateFor,
  canCaptureScreen,
  canvasBlob,
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const camOptions = (cfg) => ({ position: cfg.camPosition, size: cfg.camSize, shape: cfg.camShape, mirror: cfg.camMirror });
export const markOptions = (cfg, logo) => ({
  kind: cfg.mark === "image" && !logo ? "off" : cfg.mark,
  text: cfg.markText,
  bitmap: logo,
  position: cfg.markPosition,
  size: cfg.markSize,
  opacity: cfg.markOpacity,
});

function cancelled(error) {
  return error?.name === "NotAllowedError" || error?.name === "AbortError";
}

function elapsedOf(s) {
  if (!s?.startedAt) return 0;
  return (s.pausedAt ?? performance.now()) - s.startedAt - s.pausedTotal;
}

/** Writes a finished file into the chosen output folder. Returns the handle, or null without access. */
async function writeToFolder(folder, name, blob) {
  if (!folder?.handle || folder.permission !== "granted") return null;
  try {
    const handle = await folder.handle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle;
  } catch {
    return null;
  }
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

  const saveShot = useCallback(async (frame, crop, { quiet = false } = {}) => {
    const { settings: cfg, folder: dir, onSaved: saved } = latest.current;
    const area = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(area.x * frame.width);
    const sy = Math.round(area.y * frame.height);
    const width = Math.max(2, Math.round(area.w * frame.width));
    const height = Math.max(2, Math.round(area.h * frame.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(frame.image, sx, sy, width, height, 0, 0, width, height);
    const jpg = cfg.imageFormat === "jpg";
    const blob = await canvasBlob(canvas, jpg ? "image/jpeg" : "image/png", jpg ? cfg.imageQuality : undefined);
    const name = `${cfg.prefix || "Recording"} ${stamp()}${quiet ? `-${Math.round(performance.now()) % 1000}` : ""}.${jpg ? "jpg" : "png"}`;
    const item = {
      id: newId(),
      tool: "screen",
      kind: "image",
      name,
      mime: blob.type,
      size: blob.size,
      width,
      height,
      createdAt: Date.now(),
      blob,
      thumb: thumbnail(canvas, width, height),
    };
    await saveMedia(item).catch(() => {});
    await writeToFolder(dir, name, blob);
    if (cfg.clipboard && !jpg && typeof ClipboardItem !== "undefined") {
      navigator.clipboard?.write([new ClipboardItem({ "image/png": blob })]).catch(() => {});
    }
    saved?.(item);
    if (!quiet) toast.success("Screenshot saved", { description: `${width}×${height}${cfg.clipboard && !jpg ? " · copied" : ""}` });
  }, []);

  const finish = useCallback(
    async (s) => {
      const { settings: cfg, folder: dir, onSaved: saved } = latest.current;
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
      if (blob && !handle) {
        const written = await writeToFolder(dir, s.name, blob);
        if (!written && cfg.autoDownload) downloadBlob(blob, s.name);
      }
      saved?.(item);
      setPhase("idle");
      setClock({ elapsed: 0, bytes: 0 });
      toast.success(s.hasVideo ? "Recording saved" : "Audio saved", { description: handle ? `${s.name} · in your folder` : s.name });
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
      }
      if (cfg.repeat && s.hasVideo && !s.pausedAt && elapsed - s.lastShot >= cfg.repeatSeconds * 1000) {
        s.lastShot = elapsed;
        const frame = currentFrame(s);
        if (frame) saveShot(frame, null, { quiet: true }).catch(() => {});
      }
      if (cfg.autoStop === "time" && elapsed >= cfg.autoStopMinutes * 60000) stop();
      if (cfg.autoStop === "size" && s.bytes >= cfg.autoStopMb * 1024 * 1024) stop();
    },
    [saveShot, stop],
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
      const composite = main && (s.crop || overlayCamera || markOn || fixedSize);

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
      setInfo({ width: s.width, height: s.height, fps: cfg.fps, type: s.type, composite: Boolean(composite) });

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

      if (dir?.handle && dir.permission === "granted") {
        try {
          s.fileHandle = await dir.handle.getFileHandle(s.name, { create: true });
          s.writer = await s.fileHandle.createWritable();
        } catch {
          s.writer = null;
        }
      }

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        s.bytes += event.data.size;
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
      s.lastShot = 0;
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

  const screenshot = useCallback(
    async ({ area } = {}) => {
      const s = session.current;
      const frame = currentFrame(s);
      if (frame) return saveShot(frame).catch((error) => toast.error(error.message));
      if (s?.display && phase === "selecting") {
        const source = new FrameSource(s.display.getVideoTracks()[0].clone());
        await Promise.race([source.ready, wait(1500)]);
        await saveShot({ image: source.image, width: source.width, height: source.height }, area).catch((error) => toast.error(error.message));
        source.track.stop();
        return source.close();
      }
      if (s) return;

      const cfg = latest.current.settings;
      let stream;
      try {
        stream =
          cfg.mode === "webcam"
            ? await getCamera({ deviceId: cfg.camId })
            : await getDisplay({ mode: cfg.mode === "audio" ? "screen" : cfg.mode, fps: 30, systemAudio: false });
      } catch (error) {
        if (!cancelled(error)) toast.error("Couldn't take a screenshot", { description: error?.message });
        return;
      }
      const source = new FrameSource(stream.getVideoTracks()[0]);
      await Promise.race([source.ready, wait(2500)]);
      await wait(250);
      if (source.width) {
        await saveShot({ image: source.image, width: source.width, height: source.height }, cfg.mode === "area" ? cfg.area : null).catch((error) =>
          toast.error(error.message),
        );
      } else {
        toast.error("Couldn't grab a frame from the screen");
      }
      source.close();
      stopStream(stream);
    },
    [phase, saveShot],
  );

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
      cam: compositor.camera ? camOptions(settings) : null,
      mark: compositor.mark || settings.mark !== "off" ? markOptions(settings, logo) : null,
    });
  }, [settings, logo]);

  // Warn before closing the tab mid-recording, and show the timer in the tab title.
  const active = phase === "recording" || phase === "paused" || phase === "countdown";
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    const onUnload = (event) => event.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.title = original;
      window.removeEventListener("beforeunload", onUnload);
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

  return { phase, clock, countdown, preview, selecting, info, record, stop, togglePause, screenshot, level };
}
