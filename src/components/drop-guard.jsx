"use client";

import { useEffect } from "react";
import { strayTarget } from "@/lib/stray-drops";

const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");

/** Catches file drops that no drop zone took, so the browser never navigates to the file. */
export function DropGuard() {
  useEffect(() => {
    // Bubble phase on window runs after the page's own drop zones, so `defaultPrevented` means one took it.
    const over = (event) => {
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      const target = strayTarget();
      event.dataTransfer.dropEffect = target ? "copy" : "none";
      target?.hover?.(true);
    };
    const leave = (event) => {
      if (!event.relatedTarget) strayTarget()?.hover?.(false);
    };
    const drop = (event) => {
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      const target = strayTarget();
      target?.hover?.(false);
      if (target && event.dataTransfer.files.length) target.drop(event.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return null;
}
