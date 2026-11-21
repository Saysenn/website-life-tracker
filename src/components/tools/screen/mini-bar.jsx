"use client";

import { Camera, Pause, Play, Square } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "@/lib/tools/files";
import { fmtClock } from "@/lib/tools/media-store";
import { cn } from "@/lib/utils";

export const canPopOut = () => typeof window !== "undefined" && "documentPictureInPicture" in window;

/** Opens an always-on-top little window (Chrome / Edge) that the recording bar is rendered into. */
export async function openPopOut() {
  const pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 72 });
  for (const sheet of document.styleSheets) {
    try {
      const style = pip.document.createElement("style");
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      pip.document.head.append(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pip.document.head.append(link);
      }
    }
  }
  pip.document.documentElement.className = document.documentElement.className;
  pip.document.documentElement.style.cssText = document.documentElement.style.cssText;
  pip.document.body.className = `${document.body.className} bg-ground`;
  pip.document.body.style.cssText = "margin:0;height:100vh;display:flex;align-items:center";
  pip.document.title = "Recording";
  return pip;
}

/** The compact recording bar: status light, timer, size, pause, screenshot and stop. */
export function RecordingBar({ phase, clock, countdown, onPause, onStop, onShot, compact = false }) {
  const paused = phase === "paused";
  return (
    <div className={cn("flex items-center gap-2", compact ? "h-full w-full px-3" : "")}>
      <span className={cn("size-2.5 shrink-0 rounded-full", paused ? "bg-warning" : "animate-pulse bg-danger")} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-lg leading-none font-semibold tabular-nums">
          {phase === "countdown" ? `Starting in ${countdown}` : fmtClock(clock.elapsed / 1000)}
        </p>
        <p className="mt-1 text-2xs text-ink-3 tabular-nums">{paused ? "Paused" : phase === "saving" ? "Saving…" : formatBytes(clock.bytes)}</p>
      </div>
      <BarButton label={paused ? "Resume" : "Pause"} onClick={onPause} disabled={phase !== "recording" && !paused}>
        {paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}
      </BarButton>
      <BarButton label="Screenshot" onClick={onShot} disabled={phase === "saving"}>
        <Camera />
      </BarButton>
      <button
        type="button"
        onClick={onStop}
        disabled={phase === "saving"}
        title="Stop and save"
        className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
      >
        <Square className="size-[1.2rem] fill-current" />
        Stop
      </button>
    </div>
  );
}

function BarButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg bg-sunken text-ink transition-colors hover:bg-hover disabled:opacity-40 [&_svg]:size-[1.5rem]"
    >
      {children}
    </button>
  );
}

/** Renders the recording bar into the pop-out window while it's open, and wires the hotkeys there too. */
export function PopOut({ pip, onKeyDown, ...props }) {
  useEffect(() => {
    if (!pip) return;
    pip.addEventListener("keydown", onKeyDown);
    return () => pip.removeEventListener("keydown", onKeyDown);
  }, [pip, onKeyDown]);
  if (!pip) return null;
  return createPortal(<RecordingBar compact {...props} />, pip.document.body);
}
