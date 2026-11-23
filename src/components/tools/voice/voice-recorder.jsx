"use client";

import { AudioLines, Download, Mic, Pause, Play, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useStoredState } from "@/hooks/use-stored-state";
import { baseName, downloadBlob, formatBytes } from "@/lib/tools/files";
import { fmtClock, listMedia, mediaBlob, newId, saveMedia, stamp } from "@/lib/tools/media-store";
import { recoverJournals, startJournal } from "@/lib/tools/recording-journal";
import { extensionFor, listDevices, pickType } from "@/lib/tools/screen/capture";
import { Cancelled, Cleaner, decodeToMono, encodeMp3, encodeWav, PRESETS, SAMPLE_RATE } from "@/lib/tools/voice/clean";
import { cn } from "@/lib/utils";
import { DropZone, ProgressBar } from "../drop-zone";
import { MediaLibrary } from "../media-library";
import { deliver, savedWhere } from "@/lib/tools/save-folder";
import { SaveLocation, useSaveFolder } from "../save-location";
import { Group, Row, Slider, TOUCH_SEGMENTS } from "../screen/panels";
import { ToolHeader } from "../tool-header";
import { Choice, Select } from "../video/controls";
import { LiveWave, Waveform } from "./waveform";

const DEFAULTS = { preset: "balanced", ...PRESETS.balanced, format: "wav", micId: "", saveTo: "downloads", saveTakes: false };
const CLEAN_KEYS = ["ai", "aiMix", "reduce", "hum", "rumble", "gate", "clarity", "loudness", "trim"];

const PRESET_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "balanced", label: "Balanced" },
  { value: "strong", label: "Strong" },
];

const PRESET_HINTS = {
  light: "Takes the edge off background noise and leaves your voice untouched.",
  balanced: "Removes most background noise. Right for most recordings.",
  strong: "For loud rooms: removes as much noise as possible.",
  custom: "Your own mix. Pick a strength above to start over from it.",
};

const FEATURES = [
  ["AI noise removal", "A neural network trained on speech removes fans, traffic, keyboards, hiss and room noise."],
  ["Hum & rumble", "Finds 50/60 Hz electrical hum automatically and cuts low rumble from desks and wind."],
  ["Studio finish", "Quiets the gaps between words, adds clarity, trims silence and evens out the volume."],
];

const dbLabel = (value) => (value <= -90 ? "silent" : `${Math.round(value)} dB`);

/** Records the microphone, with pause, a live level graph and a timer. */
function useMicRecorder({ micId, onDone }) {
  const [state, setState] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState(null);
  const session = useRef(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const release = (s) => {
    clearInterval(s.timer);
    s.stream.getTracks().forEach((track) => track.stop());
    s.ctx.close().catch(() => {});
    session.current = null;
    setAnalyser(null);
  };

  const timeOf = (s) => (s.pausedAt ?? performance.now()) - s.startedAt - s.pausedTotal;

  const start = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(micId ? { deviceId: { exact: micId } } : {}),
          // The untouched sound: the cleaner does a much better job than the browser's own filters.
          noiseSuppression: false,
          echoCancellation: false,
          autoGainControl: false,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: SAMPLE_RATE },
        },
      });
    } catch (error) {
      toast.error(error?.name === "NotAllowedError" ? "Allow microphone access in the browser's address bar" : "Couldn't open the microphone");
      return;
    }
    const ctx = new AudioContext();
    const node = ctx.createAnalyser();
    node.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(node);
    const type = pickType("webm", false);
    const recorder = new MediaRecorder(stream, { mimeType: type || undefined, audioBitsPerSecond: 256000 });
    const mime = (recorder.mimeType || type || "audio/webm").split(";")[0];
    const name = `Voice ${stamp()}.${extensionFor(mime)}`;
    const s = { stream, ctx, recorder, name, chunks: [], startedAt: performance.now(), pausedTotal: 0, pausedAt: null };
    // Every chunk is also kept in browser storage as it arrives, so a refresh or crash can't lose the take.
    startJournal({ tool: "voice", kind: "audio", name, mime })
      .then((journal) => {
        s.journal = journal;
        for (const chunk of s.chunks) journal?.append(chunk, timeOf(s));
      })
      .catch(() => {});
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      s.chunks.push(event.data);
      s.journal?.append(event.data, timeOf(s));
    };
    recorder.onstop = async () => {
      const duration = timeOf(s) / 1000;
      release(s);
      setState("idle");
      setElapsed(0);
      const blob = new Blob(s.chunks, { type: mime });
      if (blob.size) await done.current?.(blob, duration, name);
      else toast.error("Nothing was recorded");
      s.journal?.discard();
    };
    recorder.start(500);
    s.timer = setInterval(() => setElapsed(timeOf(s)), 200);
    session.current = s;
    setAnalyser(node);
    setState("recording");
  };

  const stop = () => session.current?.recorder.stop();

  const togglePause = () => {
    const s = session.current;
    if (!s) return;
    if (s.recorder.state === "recording") {
      s.recorder.pause();
      s.pausedAt = performance.now();
      setState("paused");
    } else {
      s.pausedTotal += performance.now() - s.pausedAt;
      s.pausedAt = null;
      s.recorder.resume();
      setState("recording");
    }
  };

  useEffect(
    () => () => {
      const s = session.current;
      if (s?.recorder.state !== "inactive") s?.recorder.stop();
    },
    [],
  );

  // Warn before leaving mid-recording; if they leave anyway, hand over the last bit so it reaches storage.
  const active = state !== "idle";
  useEffect(() => {
    if (!active) return;
    const onUnload = (event) => event.preventDefault();
    const onHide = () => {
      const recorder = session.current?.recorder;
      if (recorder?.state === "recording") recorder.requestData();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onHide);
    };
  }, [active]);

  return { state, elapsed, analyser, start, stop, togglePause };
}

export function VoiceRecorder() {
  const [stored, setStored] = useStoredState("tools:voice-recorder", DEFAULTS);
  const cfg = useMemo(() => ({ ...DEFAULTS, ...stored }), [stored]);
  const set = useCallback((patch) => setStored((prev) => ({ ...DEFAULTS, ...prev, ...patch })), [setStored]);
  const setClean = (patch) => set({ ...patch, preset: "custom" });
  const choosePreset = (preset) => set(preset === "custom" ? { preset } : { preset, ...PRESETS[preset] });

  const [items, setItems] = useState([]);
  const [mics, setMics] = useState([]);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [work, setWork] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [tuning, setTuning] = useState(cfg.preset === "custom");
  const folder = useSaveFolder("voice", "music");
  const cleaner = useRef(null);
  const runId = useRef(0);

  useEffect(() => {
    recoverJournals("voice", saveMedia)
      .then((recovered) => {
        if (recovered.length) {
          toast.success(recovered.length === 1 ? "Recovered a recording that was cut off" : `Recovered ${recovered.length} recordings that were cut off`, {
            description: recovered.length === 1 ? `${recovered[0].name} · ${fmtClock(recovered[0].duration)} — press Clean on it below` : "They're in your recordings below.",
          });
        }
      })
      .catch(() => {})
      .finally(() => listMedia("voice").then(setItems).catch(() => {}));
    const refresh = () => listDevices().then((devices) => setMics(devices.mics));
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  const addItem = useCallback((item) => {
    setItems((list) => [item, ...list]);
    return saveMedia(item).catch(() => toast.error("Browser storage is full — download your files to keep them"));
  }, []);

  const load = useCallback(async (blob, name, duration) => {
    setLoading(true);
    runId.current += 1;
    setWork(null);
    setResult((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      return null;
    });
    try {
      const samples = await decodeToMono(blob);
      if (samples.length < SAMPLE_RATE * 0.1) throw new Error("short");
      cleaner.current = new Cleaner(samples);
      setSource({ name, blob, samples, duration: duration ?? samples.length / SAMPLE_RATE, url: URL.createObjectURL(blob), key: newId() });
    } catch (error) {
      toast.error(error?.message === "short" ? "That recording is too short" : "Couldn't read that file — try WAV, MP3, M4A, OGG, WebM or a video with sound");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => () => source?.url && URL.revokeObjectURL(source.url), [source]);

  const mic = useMicRecorder({
    micId: cfg.micId,
    onDone: (blob, duration, name) => {
      load(blob, name, duration);
      // The raw take goes to the save location too when asked; it's always kept in the list below.
      if (cfg.saveTakes && cfg.saveTo !== "browser") {
        deliver({ saveTo: cfg.saveTo, folder, name, blob }).then((where) => toast.success("Recording saved", { description: `${name} · ${savedWhere(where, folder)}` }));
      }
      return addItem({ id: newId(), tool: "voice", kind: "audio", name, mime: blob.type, size: blob.size, duration, createdAt: Date.now(), blob, badge: "Original" });
    },
  });

  // Clean again whenever the source or a setting changes. Slow steps are cached, so tweaks are quick.
  const cleanKey = CLEAN_KEYS.map((key) => cfg[key]).join("|");
  useEffect(() => {
    if (!source || !cleaner.current) return;
    const id = ++runId.current;
    const options = Object.fromEntries(CLEAN_KEYS.map((key) => [key, cfg[key]]));
    const timer = setTimeout(async () => {
      setWork({ progress: 0, detail: options.ai && !cleaner.current.cache.ai ? "Loading the AI model…" : "Cleaning…" });
      try {
        const out = await cleaner.current.run(options, {
          isCancelled: () => runId.current !== id,
          onProgress: (progress) => runId.current === id && setWork({ progress, detail: progress > 0.06 && progress < 0.5 && options.ai ? "Removing noise with AI…" : "Cleaning…" }),
        });
        if (runId.current !== id) return;
        const blob = encodeWav(out.samples);
        setResult((previous) => {
          if (previous?.url) URL.revokeObjectURL(previous.url);
          return { ...out, url: URL.createObjectURL(blob), wav: blob };
        });
        setWork(null);
      } catch (error) {
        if (error instanceof Cancelled || runId.current !== id) return;
        setWork(null);
        toast.error("Cleaning failed", { description: error?.message });
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cleanKey]);

  const exportFile = async () => {
    if (!result || !source) return;
    setExporting(true);
    try {
      const mp3 = cfg.format === "mp3";
      const blob = mp3 ? await encodeMp3(result.samples) : result.wav;
      const name = `${baseName(source.name).replace(/ \(clean\)$/, "")} (clean).${mp3 ? "mp3" : "wav"}`;
      const where = await deliver({ saveTo: cfg.saveTo, folder, name, blob });
      addItem({ id: newId(), tool: "voice", kind: "audio", name, mime: blob.type, size: blob.size, duration: result.samples.length / SAMPLE_RATE, createdAt: Date.now(), blob, badge: "Clean" });
      toast.success("Clean file saved", { description: `${name} · ${savedWhere(where, folder)}` });
    } catch (error) {
      toast.error("Couldn't make the file", { description: error?.message });
    } finally {
      setExporting(false);
    }
  };

  const allowMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMics((await listDevices()).mics);
    } catch {
      toast.error("Allow microphone access in the browser's address bar");
    }
  };

  const recording = mic.state !== "idle";

  return (
    <Page className="max-w-[120rem]">
      <ToolHeader
        icon="mic"
        title="Voice recorder"
        description="Record your voice or drop in any audio, then remove background noise, hum and hiss and download a clean file."
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Recorder */}
        <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-4">
            <Tooltip label={recording ? "Stop and clean" : "Start recording"}>
              <button
                type="button"
                onClick={recording ? mic.stop : mic.start}
                aria-label={recording ? "Stop recording" : "Start recording"}
                className={cn(
                  "relative flex size-18 shrink-0 items-center justify-center rounded-full text-white shadow-card transition-[background-color,transform] active:scale-95",
                  recording ? "bg-ink hover:bg-ink/85" : "bg-danger hover:bg-danger/90",
                )}
              >
                {mic.state === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-danger/30" />}
                {recording ? <Square className="size-[2.2rem] fill-current" /> : <Mic className="size-[2.8rem]" />}
              </button>
            </Tooltip>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-2xl font-semibold tabular-nums">{fmtClock(mic.elapsed / 1000)}</p>
              <p className="text-xs text-ink-3">
                {mic.state === "recording" ? "Recording… press stop when you're done" : mic.state === "paused" ? "Paused" : "Press the red button to record"}
              </p>
            </div>
            {recording && (
              <Tooltip label={mic.state === "paused" ? "Resume" : "Pause"}>
                <button
                  type="button"
                  onClick={mic.togglePause}
                  className={cn("flex size-11 items-center justify-center rounded-full bg-sunken transition-colors hover:bg-hover", mic.state === "paused" && "bg-warning-soft text-warning")}
                >
                  {mic.state === "paused" ? <Play className="size-[1.8rem] fill-current" /> : <Pause className="size-[1.8rem] fill-current" />}
                </button>
              </Tooltip>
            )}
          </div>

          <div className="h-16 overflow-hidden rounded-xl bg-sunken px-2">
            {mic.analyser ? (
              <LiveWave analyser={mic.analyser} active={mic.state === "recording"} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-4">
                <AudioLines className="mr-1.5 size-[1.6rem]" />
                Your voice will show here
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <Select
              label="Microphone"
              value={cfg.micId}
              onChange={(micId) => set({ micId })}
              disabled={recording}
              options={[["", "System default"], ...mics.map((device) => [device.id, device.label])]}
            />
            {mics.every((device) => device.label.startsWith("Microphone ")) && (
              <button type="button" onClick={allowMic} className="h-10 shrink-0 rounded-xl bg-sunken px-3 text-xs font-semibold hover:bg-hover">
                Show names
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-2xs font-semibold tracking-wide text-ink-4 uppercase">
            <span className="h-px flex-1 bg-grid" />
            or clean a file
            <span className="h-px flex-1 bg-grid" />
          </div>
          <DropZone
            className="py-6 sm:py-7"
            onFiles={(files) => {
              const file = [...files].find((entry) => entry.type.startsWith("audio/") || entry.type.startsWith("video/") || /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|mp4|mov)$/i.test(entry.name));
              if (!file) return toast.error("Choose an audio file");
              load(file, file.name);
            }}
            accept="audio/*,video/*,.m4a,.opus,.flac"
            title="Choose an audio file"
            hint="or drop it here"
            note="WAV, MP3, M4A, OGG, FLAC, or a video with sound"
          />
        </section>

        {/* Cleaner */}
        <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-5 w-1/2 animate-shimmer rounded-md bg-skeleton" />
              <div className="h-28 animate-shimmer rounded-xl bg-skeleton" />
              <div className="h-28 animate-shimmer rounded-xl bg-skeleton" />
            </div>
          ) : !source ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-2 rounded-xl bg-sunken px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-surface text-data shadow-card">
                  <Sparkles className="size-[2.2rem]" strokeWidth={1.6} />
                </span>
                <p className="text-base font-semibold">Record or drop in audio to clean it</p>
                <p className="max-w-[44rem] text-sm text-ink-3">Everything happens on this device. You’ll hear before and after, then download a clean WAV or MP3.</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-3">
                {FEATURES.map(([title, body]) => (
                  <li key={title} className="rounded-xl bg-sunken/70 p-3">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Compare key={source.key} source={source} result={result} work={work} />
          )}

          {source && (
            <>
              <Group title="Cleanup">
                <div className="flex flex-col gap-2 py-3">
                  <Segmented label="Strength" value={cfg.preset} onChange={choosePreset} options={PRESET_OPTIONS} className={`w-full [&>button]:flex-1 [&>button]:justify-center ${TOUCH_SEGMENTS}`} />
                  <p className="text-xs text-ink-3">{PRESET_HINTS[cfg.preset]}</p>
                </div>
                <Row label="Fine-tune" hint="Set each step yourself: AI noise removal, hum, rumble, gaps, clarity and volume.">
                  <Switch checked={tuning} onCheckedChange={setTuning} />
                </Row>
              </Group>

              {tuning && (
                <Group title="Fine-tune">
                  <Row label="AI noise removal" hint="Removes fans, traffic, keyboard clicks, hiss and room echo around your voice.">
                    <Switch checked={cfg.ai} onCheckedChange={(ai) => setClean({ ai })} />
                  </Row>
                  {cfg.ai && (
                    <Row label="AI amount" hint="Lower it if your voice starts to sound watery.">
                      <Slider label="AI amount" value={cfg.aiMix} min={0.3} max={1} step={0.05} onChange={(aiMix) => setClean({ aiMix })} />
                    </Row>
                  )}
                  <Row label="Steady noise reduction" hint="Takes out constant hiss and hum that's left over.">
                    <Slider label="Noise reduction" value={cfg.reduce} onChange={(reduce) => setClean({ reduce })} />
                  </Row>
                  <Row label="Quiet the gaps" hint="Turns down the background between words and sentences.">
                    <Slider label="Gate" value={cfg.gate} onChange={(gate) => setClean({ gate })} />
                  </Row>
                  <Row label="Remove electrical hum">
                    <div className="w-full sm:w-64">
                      <Choice
                        value={cfg.hum}
                        onChange={(hum) => setClean({ hum })}
                        options={[
                          { value: "auto", label: "Auto" },
                          { value: "50", label: "50 Hz" },
                          { value: "60", label: "60 Hz" },
                          { value: "off", label: "Off" },
                        ]}
                      />
                    </div>
                  </Row>
                  <Row label="Remove low rumble" hint="Cuts thumps, wind and desk vibration below the voice.">
                    <Switch checked={cfg.rumble} onCheckedChange={(rumble) => setClean({ rumble })} />
                  </Row>
                  <Row label="Voice clarity" hint="A gentle boost to presence so words are easier to understand.">
                    <Switch checked={cfg.clarity} onCheckedChange={(clarity) => setClean({ clarity })} />
                  </Row>
                  <Row label="Even out the volume" hint="Brings your voice to a steady, comfortable loudness without clipping.">
                    <Switch checked={cfg.loudness} onCheckedChange={(loudness) => setClean({ loudness })} />
                  </Row>
                  <Row label="Trim silence at the ends">
                    <Switch checked={cfg.trim} onCheckedChange={(trim) => setClean({ trim })} />
                  </Row>
                </Group>
              )}

              <div className="flex flex-wrap items-end gap-3 rounded-xl bg-sunken/70 p-3">
                <div className="w-full sm:w-56">
                  <Choice
                    label="File type"
                    value={cfg.format}
                    onChange={(format) => set({ format })}
                    options={[
                      { value: "wav", label: "WAV", note: "Best quality" },
                      { value: "mp3", label: "MP3", note: "Small, 192 kbps" },
                    ]}
                  />
                </div>
                <button
                  type="button"
                  onClick={exportFile}
                  disabled={!result || Boolean(work) || exporting}
                  className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-base font-semibold text-ground transition-colors hover:bg-ink/85 disabled:opacity-50"
                >
                  {exporting ? <RefreshCw className="size-[1.8rem] animate-spin" /> : <Download className="size-[1.8rem]" />}
                  {cfg.saveTo === "downloads" ? "Download" : "Save"} clean {cfg.format.toUpperCase()}
                </button>
              </div>
            </>
          )}

          <Group title="Where files go">
            <SaveLocation value={cfg.saveTo} onChange={(saveTo) => set({ saveTo })} folder={folder} what="cleaned files" />
            <Row label="Also save each raw recording" hint="Every take is kept in the list below either way; this also puts the untouched original where your files go." disabled={cfg.saveTo === "browser"}>
              <Switch checked={cfg.saveTakes && cfg.saveTo !== "browser"} onCheckedChange={(saveTakes) => set({ saveTakes })} disabled={cfg.saveTo === "browser"} />
            </Row>
          </Group>
        </section>
      </div>

      <MediaLibrary
        title="Voice recordings"
        items={items}
        setItems={setItems}
        kinds={["audio"]}
        empty="Your recordings and cleaned files will show up here. They stay in this browser until you delete them."
        itemAction={{
          label: "Clean",
          hint: "Open in the cleaner",
          icon: <Sparkles />,
          onClick: async (item) => {
            try {
              await load(await mediaBlob(item), item.name, item.duration);
              window.scrollTo({ top: 0, behavior: "smooth" });
            } catch (error) {
              toast.error(error.message);
            }
          },
        }}
      />
    </Page>
  );
}

/** Before/after player: one transport, switch between the original and the cleaned version at the same moment. */
function Compare({ source, result, work }) {
  const original = useRef(null);
  const cleaned = useRef(null);
  const root = useRef(null);
  const [which, setWhich] = useState("clean");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const offset = result?.offset ?? 0;
  const cleanDuration = result ? result.samples.length / SAMPLE_RATE : source.duration;
  const active = () => (which === "clean" && result ? cleaned.current : original.current);

  // Time is kept on the cleaned file's clock; the original is ahead by whatever was trimmed off the start.
  const toOriginal = (t) => t + offset;

  const seek = (fraction, on = which) => {
    const t = fraction * (on === "clean" ? cleanDuration : source.duration);
    const cleanTime = on === "clean" ? t : Math.max(0, t - offset);
    setTime(cleanTime);
    if (original.current) original.current.currentTime = toOriginal(cleanTime);
    if (cleaned.current) cleaned.current.currentTime = Math.min(cleanTime, cleanDuration);
  };

  const toggle = () => {
    const element = active();
    if (!element) return;
    if (playing) element.pause();
    else element.play().catch(() => {});
  };

  const switchTo = (next) => {
    if (next === which || (next === "clean" && !result)) return;
    const from = active();
    const to = next === "clean" ? cleaned.current : original.current;
    const wasPlaying = playing;
    from?.pause();
    // Read the position from the element itself: a click on a waveform has just seeked it, and state may lag behind.
    const now = from ? (which === "clean" ? from.currentTime : Math.max(0, from.currentTime - offset)) : time;
    if (to) {
      to.currentTime = next === "clean" ? Math.min(now, cleanDuration) : toOriginal(now);
      if (wasPlaying) to.play().catch(() => {});
    }
    setWhich(next);
  };

  // A fresh clean (settings changed) keeps the listening position, and keeps playing if it was: swapping the
  // file stops the element, and this render still sees `playing` from before that.
  useEffect(() => {
    if (!cleaned.current || !result) return;
    cleaned.current.currentTime = Math.min(time, result.samples.length / SAMPLE_RATE);
    if (playing && which === "clean") cleaned.current.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.url]);

  const events = (name) => ({
    onPlay: () => name === which && setPlaying(true),
    onPause: () => name === which && setPlaying(false),
    onEnded: () => name === which && setPlaying(false),
    onTimeUpdate: (event) => {
      if (name !== which) return;
      const t = event.currentTarget.currentTime;
      setTime(name === "clean" ? t : Math.max(0, t - offset));
    },
  });

  useEffect(() => {
    const onKey = (event) => {
      // Typing fields keep their keys. Buttons elsewhere too, but the player's own buttons (Before/After, Play,
      // the waveforms) don't: after clicking one, Space should still mean play/pause, not "press it again".
      const field = event.target.closest?.("input, textarea, select, button, [contenteditable]");
      if (field && !(field.tagName === "BUTTON" && root.current?.contains(field))) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const originalProgress = source.duration ? toOriginal(time) / source.duration : 0;
  const cleanProgress = cleanDuration ? time / cleanDuration : 0;

  return (
    <div ref={root} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{source.name}</p>
          <p className="text-xs text-ink-3">
            {fmtClock(source.duration)} · {formatBytes(source.blob.size)}
          </p>
        </div>
        {work && (
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <RefreshCw className="size-[1.3rem] animate-spin" />
            {work.detail} {Math.round(work.progress * 100)}%
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => switchTo("original")}
          className={cn("h-20 overflow-hidden rounded-xl bg-sunken text-left transition-shadow", which === "original" && "ring-2 ring-ink/70")}
          aria-pressed={which === "original"}
        >
          <Waveform samples={source.samples} progress={originalProgress} tone="ink" label="Before" onSeek={(f) => seek(f, "original")} className="h-full" />
        </button>
        <button
          type="button"
          onClick={() => switchTo("clean")}
          className={cn("relative h-20 overflow-hidden rounded-xl bg-data-soft/60 text-left transition-shadow", which === "clean" && "ring-2 ring-data")}
          aria-pressed={which === "clean"}
        >
          {result ? (
            <Waveform samples={result.samples} progress={cleanProgress} tone="data" label="After" onSeek={(f) => seek(f, "clean")} className="h-full" />
          ) : (
            <div className="h-full animate-shimmer bg-skeleton/60" />
          )}
          {work && <ProgressBar value={work.progress} tone="data" className="absolute inset-x-3 bottom-2" />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-11 items-center justify-center rounded-full bg-ink text-ground transition-colors hover:bg-ink/85"
        >
          {playing ? <Pause className="size-[1.8rem] fill-current" /> : <Play className="size-[1.8rem] translate-x-px fill-current" />}
        </button>
        <Segmented
          label="Listen to"
          className={TOUCH_SEGMENTS}
          value={which}
          onChange={switchTo}
          options={[
            { value: "original", label: "Before" },
            { value: "clean", label: "After" },
          ]}
        />
        <span className="font-mono text-sm text-ink-2 tabular-nums">
          {fmtClock(time)} / {fmtClock(cleanDuration)}
        </span>
        <span className="flex-1" />
        {result && (
          <div className="flex flex-wrap gap-1.5 text-2xs font-semibold">
            <span className="rounded-md bg-success-soft px-2 py-1 text-success">
              Background {dbLabel(result.before.noise)} → {dbLabel(result.after.noise)}
            </span>
            {result.hum && <span className="rounded-md bg-sunken px-2 py-1 text-ink-2">{result.hum} Hz hum removed</span>}
            {result.trimmed > 0.05 && <span className="rounded-md bg-sunken px-2 py-1 text-ink-2">Trimmed {result.trimmed.toFixed(1)} s</span>}
          </div>
        )}
      </div>

      <audio ref={original} src={source.url} preload="auto" className="hidden" {...events("original")} />
      {result && <audio ref={cleaned} src={result.url} preload="auto" className="hidden" {...events("clean")} />}
      <p className="text-2xs text-ink-4">
        Space plays and pauses. Click a waveform to jump there, or to switch between before and after.
      </p>
    </div>
  );
}
