"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { baseName, downloadBlob } from "@/lib/tools/files";
import { fmtTime } from "@/lib/tools/video/frames";
import { OCR_LANGUAGES, readScreenText } from "@/lib/tools/video/ocr";
import { LANGUAGES, MODELS, decodeAudio, stopTranscriber, toPlainText, toSrt, toVtt, transcribe } from "@/lib/tools/video/transcribe";
import { Choice, CopyButton, RunButton, Select, SmallButton } from "./controls";

const saveText = (text, name, type = "text/plain") => downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);

function Results({ entries, timestamps, onTimestamps, onSeek, file, kind, extraDownloads }) {
  const text = toPlainText(entries, timestamps);
  const joined = kind === "screen" ? entries.map((entry) => (timestamps ? `[${fmtTime(entry.start)}]\n${entry.text}` : entry.text)).join("\n\n") : text;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex items-center gap-2 text-sm font-medium text-ink-2">
          <Switch checked={timestamps} onCheckedChange={onTimestamps} />
          Timestamps
        </label>
        <CopyButton text={joined} label="Copy all" />
        <SmallButton onClick={() => saveText(joined, `${baseName(file.name)}-${kind === "screen" ? "screen-text" : "transcript"}.txt`)}>
          <Download />
          .txt
        </SmallButton>
        {extraDownloads}
      </div>
      <ol className="flex flex-col divide-y divide-grid overflow-hidden rounded-2xl bg-surface shadow-card">
        {entries.map((entry) => (
          <li key={`${entry.start}-${entry.id ?? ""}`} className="flex gap-3 px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => onSeek(entry.start)}
              title="Play from here"
              className="h-6 shrink-0 rounded-md bg-sunken px-1.5 text-xs font-semibold text-ink-2 tabular-nums hover:bg-hover hover:text-ink"
            >
              {fmtTime(entry.start)}
            </button>
            <p className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap select-text">{entry.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TranscriptPanel({ file, onSeek }) {
  const [model, setModel] = useState(MODELS[1].value);
  const [language, setLanguage] = useState("");
  const [translate, setTranslate] = useState(false);
  const [segments, setSegments] = useState([]);
  const [timestamps, setTimestamps] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState({ progress: 0, detail: "" });
  const [finished, setFinished] = useState(false);
  const stop = useRef(false);
  const audio = useRef({ file: null, samples: null });

  const start = async () => {
    stop.current = false;
    setRunning(true);
    setFinished(false);
    setSegments([]);
    try {
      if (audio.current.file !== file) {
        setStatus({ progress: 0, detail: "Pulling the sound out of the video…" });
        audio.current = { file, samples: await decodeAudio(file) };
      }
      await transcribe(audio.current.samples, {
        model,
        language,
        translate,
        cancelled: () => stop.current,
        onProgress: setStatus,
        onSegment: (segment) => setSegments((current) => [...current, segment]),
      });
      setFinished(true);
    } catch (error) {
      if (!stop.current) toast.error(error.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <Choice label="Speech model" value={model} onChange={setModel} options={MODELS} disabled={running} />
        <Select label="Spoken language" value={language} onChange={setLanguage} options={LANGUAGES} disabled={running} />
        <label className="flex items-center justify-between gap-3 rounded-xl bg-sunken px-3.5 py-2.5">
          <span>
            <span className="block text-sm font-semibold">Translate to English</span>
            <span className="block text-xs text-ink-3">Write the transcript in English whatever language is spoken</span>
          </span>
          <Switch checked={translate} onCheckedChange={setTranslate} disabled={running} />
        </label>
        <RunButton
          running={running}
          progress={status.progress}
          detail={status.detail}
          onStart={start}
          onStop={() => {
            stop.current = true;
            stopTranscriber();
          }}
          label="Get transcript"
        />
        <p className="text-xs text-ink-3">
          Runs a speech-recognition model in your browser. The first run downloads it once; after that it&apos;s cached.
          Long videos take a while — roughly real-time or faster on a laptop, slower on phones.
        </p>
      </div>

      {segments.length > 0 && (
        <Results
          entries={segments}
          timestamps={timestamps}
          onTimestamps={setTimestamps}
          onSeek={onSeek}
          file={file}
          kind="speech"
          extraDownloads={
            <>
              <SmallButton onClick={() => saveText(toSrt(segments), `${baseName(file.name)}.srt`)}>
                <Download />
                .srt
              </SmallButton>
              <SmallButton onClick={() => saveText(toVtt(segments), `${baseName(file.name)}.vtt`, "text/vtt")}>
                <Download />
                .vtt
              </SmallButton>
            </>
          }
        />
      )}
      {finished && !segments.length && (
        <p className="rounded-2xl bg-surface p-4 text-center text-sm text-ink-3 shadow-card">No speech found in this video.</p>
      )}
    </div>
  );
}

const INTERVALS = [
  { value: "0.5", label: "0.5 s" },
  { value: "1", label: "1 s" },
  { value: "2", label: "2 s" },
  { value: "5", label: "5 s" },
];

export function ScreenTextPanel({ file, src, onSeek }) {
  const [language, setLanguage] = useState("eng");
  const [every, setEvery] = useState("1");
  const [entries, setEntries] = useState([]);
  const [timestamps, setTimestamps] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState({ progress: 0, detail: "" });
  const [finished, setFinished] = useState(false);
  const stop = useRef(false);

  const start = async () => {
    stop.current = false;
    setRunning(true);
    setFinished(false);
    setEntries([]);
    try {
      await readScreenText(src, {
        language,
        every: Number(every),
        cancelled: () => stop.current,
        onProgress: setStatus,
        onEntry: (entry, existing) =>
          setEntries((current) => (existing ? current.map((item) => (item.id === entry.id ? entry : item)) : [...current, entry])),
      });
      setFinished(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <Select label="Text language" value={language} onChange={setLanguage} options={OCR_LANGUAGES} disabled={running} />
        <Choice label="Check the screen every" value={every} onChange={setEvery} options={INTERVALS} disabled={running} />
        <RunButton
          running={running}
          progress={status.progress}
          detail={status.detail}
          onStart={start}
          onStop={() => (stop.current = true)}
          label="Read on-screen text"
        />
        <p className="text-xs text-ink-3">
          Reads captions, slides, titles and other text shown in the picture. Identical screens are skipped and repeated
          text is merged, so you get each piece once with the time it appears.
        </p>
      </div>

      {entries.length > 0 && (
        <Results entries={entries} timestamps={timestamps} onTimestamps={setTimestamps} onSeek={onSeek} file={file} kind="screen" />
      )}
      {finished && !entries.length && (
        <p className="rounded-2xl bg-surface p-4 text-center text-sm text-ink-3 shadow-card">No readable text found on screen.</p>
      )}
    </div>
  );
}
