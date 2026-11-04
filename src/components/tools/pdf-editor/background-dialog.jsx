"use client";

import { useCallback, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { BackgroundRemover } from "./background-remover";

/** Remove the background of an image already placed on the page. */
export function BackgroundDialog({ image, onOpenChange, onApply }) {
  const [result, setResult] = useState(null);
  const onResult = useCallback((src, width, height) => setResult(src ? { src, width, height } : null), []);

  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={onOpenChange}
      title="Remove background"
      description="Great for signatures, stamps and logos on a plain background."
    >
      {image && <BackgroundRemover src={image.originalSrc ?? image.src} onResult={onResult} />}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="h-10 rounded-xl px-4 text-sm font-medium text-ink-2 hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(result);
            onOpenChange(false);
          }}
          className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-ground hover:bg-ink/85"
        >
          Apply
        </button>
      </div>
    </Dialog>
  );
}
