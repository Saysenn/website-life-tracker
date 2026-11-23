"use client";

import { Webcam, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { drawCameraBubble, getCamera, stopStream } from "@/lib/tools/screen/capture";
import { camOptions } from "./use-screen-recorder";

const W = 960;
const H = 540;

/** A stand-in face so the bubble's look can be tried without turning the camera on. */
function placeholder() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, 480);
  bg.addColorStop(0, "#8a7c6b");
  bg.addColorStop(1, "#5f5347");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = "#d8c8b4";
  ctx.beginPath();
  ctx.ellipse(320, 205, 82, 98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b4a5c";
  ctx.beginPath();
  ctx.ellipse(320, 520, 210, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** A pretend desktop, so position and size read the way they will in a recording. */
function drawDesktop(ctx) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#e9e1d4");
  bg.addColorStop(1, "#d6cab8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fffdfa";
  ctx.beginPath();
  ctx.roundRect(70, 50, 820, 440, 14);
  ctx.fill();
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(70, 50, 820, 34);
  ctx.fillStyle = "#e5ddd0";
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.roundRect(110, 120 + i * 52, i % 2 ? 520 : 680, 18, 6);
    ctx.fill();
  }
}

/** Live preview of the webcam bubble with the current design. */
export function BubblePreview({ cfg, enabled }) {
  const canvas = useRef(null);
  const latest = useRef(cfg);
  const [stream, setStream] = useState(null);
  const video = useRef(null);
  const fake = useRef(null);

  useEffect(() => {
    latest.current = cfg;
  });

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    fake.current ??= placeholder();
    let frame;
    const loop = () => {
      drawDesktop(ctx);
      const v = video.current;
      const live = stream && v && v.videoWidth;
      const image = live ? v : fake.current;
      drawCameraBubble(ctx, camOptions(latest.current), image, live ? v.videoWidth : 640, live ? v.videoHeight : 480, W, H);
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [stream]);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
    return () => stopStream(stream);
  }, [stream]);

  const toggle = async () => {
    if (stream) return setStream(null);
    try {
      setStream(await getCamera({ deviceId: cfg.camId }));
    } catch {
      toast.error("Allow camera access in the browser's address bar");
    }
  };

  return (
    <div className="relative w-full max-w-[52rem] overflow-hidden rounded-xl bg-sunken">
      <canvas ref={canvas} width={W} height={H} className={enabled ? "block aspect-video w-full" : "block aspect-video w-full opacity-50"} />
      <video ref={video} autoPlay muted playsInline className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="absolute top-2 left-2 flex h-8 items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 text-xs font-semibold shadow-card backdrop-blur hover:bg-surface"
      >
        {stream ? <X className="size-[1.3rem]" /> : <Webcam className="size-[1.3rem]" />}
        {stream ? "Stop camera" : "Try with my camera"}
      </button>
    </div>
  );
}
