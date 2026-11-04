"use client";

import { Download, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { baseName } from "@/lib/tools/files";
import { fmtTime } from "@/lib/tools/video/frames";
import { toSrt, toVtt } from "@/lib/tools/video/transcribe";
import { Select, SmallButton } from "./controls";
import { Results, saveTranscript } from "./text-panels";

/** Asks the server for a YouTube video's captions. Throws with a readable message. */
export async function loadYouTube(url, { track, translate, signal } = {}) {
  const params = new URLSearchParams({ url });
  if (track) params.set("track", track);
  if (translate) params.set("translate", translate);
  let response;
  try {
    response = await fetch(`/api/tools/youtube?${params}`, { signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? "Couldn't get the transcript. Try again in a moment.");
  return data;
}

const TRANSLATE_TO = "en";

/** Shows the transcript of a YouTube link, with language switching and copy/download. */
export function YouTubePanel({ url, initial, onClose }) {
  const [data, setData] = useState(initial);
  const [translate, setTranslate] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { video, tracks, track, segments } = data;
  // Files are named after the video; the fake extension is stripped by baseName().
  const name = `${video.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || video.id}.youtube`;
  const current = tracks.find((item) => item.id === track);

  const reload = async (nextTrack, nextTranslate) => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadYouTube(url, { track: nextTrack, translate: nextTranslate }));
      setTranslate(nextTranslate);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setLoading(false);
    }
  };

  const languageOptions = tracks.map((item) => [item.id, item.label]);
  if (current && current.language !== TRANSLATE_TO) languageOptions.push([`translate:${track}`, "English (translated)"]);

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      <div className="flex flex-col gap-2 lg:sticky lg:top-5">
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="size-full"
          />
        </div>
        <div className="flex items-start gap-2 px-1">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{video.title}</span>
            <span className="text-ink-3">
              {video.author && ` · ${video.author}`}
              {video.duration > 0 && ` · ${fmtTime(video.duration)}`}
            </span>
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-semibold hover:bg-hover"
          >
            <ExternalLink className="size-[1.3rem]" />
            YouTube
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-semibold hover:bg-hover"
          >
            <X className="size-[1.3rem]" />
            Close
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {tracks.length > 0 && (
          <div className="flex items-end gap-3 rounded-2xl bg-surface p-4 shadow-card">
            <Select
              label="Transcript language"
              value={translate ? `translate:${track}` : track}
              onChange={(value) => (value.startsWith("translate:") ? reload(track, TRANSLATE_TO) : reload(value, ""))}
              options={languageOptions}
              disabled={loading}
            />
            {loading && <Spinner className="mb-2.5 size-[1.8rem] text-ink-3" />}
          </div>
        )}
        {error && <p className="rounded-2xl bg-surface p-4 text-sm text-ink-2 shadow-card">{error}</p>}

        {segments.length > 0 ? (
          <Results
            entries={segments}
            timestamps={timestamps}
            onTimestamps={setTimestamps}
            seekHref={(time) => `https://www.youtube.com/watch?v=${video.id}&t=${Math.floor(time)}s`}
            name={name}
            kind="speech"
            extraDownloads={
              <>
                <SmallButton onClick={() => saveTranscript(toSrt(segments), `${baseName(name)}.srt`)}>
                  <Download />
                  .srt
                </SmallButton>
                <SmallButton onClick={() => saveTranscript(toVtt(segments), `${baseName(name)}.vtt`, "text/vtt")}>
                  <Download />
                  .vtt
                </SmallButton>
              </>
            }
          />
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-sm text-ink-3 shadow-card">
            This video has no captions on YouTube, so there&apos;s no text to show. Save the video to your device and drop the
            file here instead. The tool can then listen to it and write out what&apos;s said.
          </p>
        )}
      </div>
    </div>
  );
}
