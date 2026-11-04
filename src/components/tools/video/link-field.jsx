"use client";

import { Link2, TriangleAlert } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { formatBytes } from "@/lib/tools/files";
import { fetchVideo, findUrl, platformOf } from "@/lib/tools/video/link";
import { RunButton } from "./controls";
import { loadYouTube } from "./youtube-panel";

/** "Or paste a link" box. YouTube links go straight to the transcript; direct video links are downloaded; other platforms get an explanation. */
export const LinkField = forwardRef(function LinkField({ onFile, onYouTube }, ref) {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState(null);
  const [job, setJob] = useState(null);
  const abort = useRef(null);

  const open = async (text) => {
    setValue(text);
    setProblem(null);
    const url = findUrl(text);
    if (!url) return setProblem({ title: "That doesn't look like a link", body: "Paste the full address, starting with https://" });

    const platform = platformOf(url);
    if (platform === "YouTube") {
      const controller = new AbortController();
      abort.current = controller;
      setJob({ progress: 0, detail: "Getting the transcript from YouTube…" });
      try {
        onYouTube(url.href, await loadYouTube(url.href, { signal: controller.signal }));
        setValue("");
      } catch (error) {
        if (error?.name !== "AbortError") setProblem({ title: "Couldn't get the transcript", body: error.message });
      } finally {
        abort.current = null;
        setJob(null);
      }
      return;
    }
    if (platform) {
      return setProblem({
        title: `${platform} links can't be opened here`,
        body: `${platform} only plays videos in its own app and blocks other sites from downloading them. Save the video to your device first (most apps have a Save or Download option under Share), then drop the file above.`,
      });
    }

    const controller = new AbortController();
    abort.current = controller;
    setJob({ progress: 0, detail: "Downloading video…" });
    try {
      const file = await fetchVideo(url, {
        signal: controller.signal,
        onProgress: (progress, loaded) => setJob({ progress, detail: `Downloading video… ${formatBytes(loaded)}` }),
      });
      onFile(file);
    } catch (error) {
      if (error?.name !== "AbortError") setProblem({ title: "Couldn't get the video", body: error.message });
    } finally {
      abort.current = null;
      setJob(null);
    }
  };

  useImperativeHandle(ref, () => ({ open }));

  return (
    <div className="flex flex-col gap-2">
      {job ? (
        <RunButton running progress={job.progress} detail={job.detail} onStop={() => abort.current?.abort()} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) open(value.trim());
          }}
          className="flex h-12 items-center gap-2 rounded-xl bg-sunken pr-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ink/15"
        >
          <Link2 className="size-[1.7rem] shrink-0 text-ink-3" />
          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setProblem(null);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text/plain").trim();
              if (!text) return;
              event.preventDefault();
              open(text);
            }}
            placeholder="…or paste a YouTube link to get its transcript"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-9 shrink-0 items-center rounded-lg bg-ink px-3.5 text-sm font-semibold text-ground hover:bg-ink/85 disabled:opacity-40"
          >
            Open
          </button>
        </form>
      )}
      {problem && (
        <div role="alert" className="flex gap-2.5 rounded-xl bg-surface p-3.5 shadow-card">
          <TriangleAlert className="mt-0.5 size-[1.6rem] shrink-0 text-ink-3" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{problem.title}</p>
            <p className="mt-0.5 text-xs text-ink-3">{problem.body}</p>
          </div>
        </div>
      )}
    </div>
  );
});
