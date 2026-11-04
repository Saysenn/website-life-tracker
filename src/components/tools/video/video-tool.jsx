"use client";

import { Captions, Images, RefreshCw, ScanText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { formatBytes } from "@/lib/tools/files";
import { fmtTime } from "@/lib/tools/video/frames";
import { cn } from "@/lib/utils";
import { DropZone } from "../drop-zone";
import { ToolHeader } from "../tool-header";
import { FramesPanel } from "./frames-panel";
import { LinkField } from "./link-field";
import { ScreenTextPanel, TranscriptPanel } from "./text-panels";

const TABS = [
  { value: "frames", label: "Images", icon: Images },
  { value: "speech", label: "Spoken words", icon: Captions },
  { value: "screen", label: "On-screen text", icon: ScanText },
];

const FEATURES = [
  ["Video → images", "Grab a frame every few seconds, a set number of frames, or one per scene change. JPG, PNG or WEBP, zipped."],
  ["Spoken words → transcript", "Turns speech into text with timestamps. Copy it, or save as .txt or .srt / .vtt subtitles. Can translate to English."],
  ["On-screen text → text", "Reads captions, slides and titles shown in the video, without duplicates."],
];

export function VideoTool() {
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState(null);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState("frames");
  const player = useRef(null);
  const linkField = useRef(null);

  const choose = (files) => {
    const picked = [...files].find((item) => item.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i.test(item.name));
    if (!picked) return toast.error("Choose a video file");
    if (src) URL.revokeObjectURL(src);
    setInfo(null);
    setFile(picked);
    setSrc(URL.createObjectURL(picked));
  };

  // Ctrl/Cmd+V anywhere on the page (outside a text box) takes a copied video file or link.
  useEffect(() => {
    if (file) return;
    const onPaste = (event) => {
      if (event.target.closest?.("input, textarea, [contenteditable]")) return;
      const files = event.clipboardData?.files;
      if (files?.length) {
        event.preventDefault();
        return choose(files);
      }
      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (text) {
        event.preventDefault();
        linkField.current?.open(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const seekTo = (time) => {
    const video = player.current;
    if (!video) return;
    video.currentTime = time;
    video.play().catch(() => {});
    video.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <Page className="max-w-[96rem]">
      <ToolHeader
        icon="video"
        title="Video to images & text"
        description="Pull still images out of a video, transcribe what's said, or read the text shown on screen."
      />

      {!file ? (
        <>
          <div className="mt-5 flex flex-col gap-2">
            <DropZone
              onFiles={choose}
              onText={(text) => linkField.current?.open(text)}
              accept="video/*,.mkv,.mov"
              title="Choose a video"
              hint="or drop or paste it here"
              note="MP4, MOV, WebM · stays on your device"
            />
            <LinkField ref={linkField} onFile={(picked) => choose([picked])} />
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <li key={title} className="rounded-2xl bg-surface p-4 shadow-card">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-ink-3">{body}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <div className="flex flex-col gap-2 lg:sticky lg:top-5">
            <video
              ref={player}
              key={src}
              src={src}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) =>
                setInfo({ duration: event.currentTarget.duration, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
              }
              onError={() => toast.error("This browser can't play this video format. Try MP4 (H.264) or WebM.")}
              className="aspect-video w-full rounded-2xl bg-black"
            />
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{file.name}</span>
                <span className="text-ink-3">
                  {" · "}
                  {formatBytes(file.size)}
                  {info && Number.isFinite(info.duration) && ` · ${fmtTime(info.duration)} · ${info.width}×${info.height}`}
                </span>
              </p>
              <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-semibold hover:bg-hover">
                <RefreshCw className="size-[1.3rem]" />
                Change
                <input
                  type="file"
                  accept="video/*,.mkv,.mov"
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files?.length) choose(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-hover p-1">
              {TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  role="tab"
                  type="button"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold text-ink-2 transition-colors hover:text-ink sm:flex-row sm:gap-1.5 sm:text-sm",
                    tab === value && "bg-surface text-ink shadow-card",
                  )}
                >
                  <Icon className="size-[1.7rem]" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>

            {/* Panels stay mounted so switching tabs never loses results or stops a running job. */}
            <div key={src} className="contents">
              <div hidden={tab !== "frames"}>
                {info ? <FramesPanel file={file} src={src} duration={info.duration} onSeek={seekTo} /> : null}
              </div>
              <div hidden={tab !== "speech"}>
                <TranscriptPanel file={file} onSeek={seekTo} />
              </div>
              <div hidden={tab !== "screen"}>
                <ScreenTextPanel file={file} src={src} onSeek={seekTo} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
