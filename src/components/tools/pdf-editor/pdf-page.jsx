"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { renderPage } from "@/lib/tools/pdf/pdfjs";
import { cn } from "@/lib/utils";
import { CoverPatch, PdfObject, toPageDelta } from "./pdf-object";

const DRAW_TOOLS = new Set(["whiteout", "highlight", "rect", "ellipse"]);

/** Converts a pointer position into page points, undoing display rotation. */
function pointOnPage(event, element, entry, scale) {
  const rect = element.getBoundingClientRect();
  const [dx, dy] = toPageDelta(
    event.clientX - (rect.left + rect.width / 2),
    event.clientY - (rect.top + rect.height / 2),
    entry.rotation,
    scale,
  );
  return [entry.width / 2 + dx, entry.height / 2 + dy];
}

export function PdfPage({ entry, number, pdf, scale, objects, selectedId, editingId, tool, lines, actions }) {
  const inner = useRef(null);
  const canvas = useRef(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dropping, setDropping] = useState(false);

  const sideways = entry.rotation % 180 !== 0;
  const width = entry.width * scale;
  const height = entry.height * scale;

  useEffect(() => {
    const observer = new IntersectionObserver(([item]) => setVisible(item.isIntersecting), { rootMargin: "1200px 0px" });
    observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !pdf || entry.index === null) return;
    let task;
    const timer = setTimeout(() => {
      task = renderPage(pdf, entry.index, canvas.current, scale);
      task.done.then(() => setRendered(true));
    }, 60);
    return () => {
      clearTimeout(timer);
      task?.cancel();
    };
  }, [visible, pdf, entry.index, scale]);

  const editMode = tool === "edit";

  useEffect(() => {
    if (editMode && visible && pdf && entry.index !== null && !lines) actions.requestLines(entry);
  }, [editMode, visible, pdf, entry, lines, actions]);
  const interactive = tool === "select" || editMode;
  const editedLines = new Set(objects.map((object) => object.sourceLine).filter(Boolean));

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const [x, y] = pointOnPage(event, inner.current, entry, scale);
    if (tool === "text") {
      event.preventDefault();
      actions.addText(entry.id, x, y);
      return;
    }
    if (DRAW_TOOLS.has(tool)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft({ startX: x, startY: y, x, y, w: 0, h: 0 });
      return;
    }
    actions.select(null);
  };

  const onPointerMove = (event) => {
    if (!draft) return;
    const [x, y] = pointOnPage(event, inner.current, entry, scale);
    setDraft({
      ...draft,
      x: Math.min(draft.startX, x),
      y: Math.min(draft.startY, y),
      w: Math.abs(x - draft.startX),
      h: Math.abs(y - draft.startY),
    });
  };

  const onPointerUp = () => {
    if (!draft) return;
    actions.addShape(entry.id, tool, draft);
    setDraft(null);
  };

  return (
    <div
      className="relative mx-auto shrink-0"
      style={{ width: sideways ? height : width, height: sideways ? width : height }}
    >
      <div
        ref={inner}
        data-page-id={entry.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragOver={(event) => {
          if ([...event.dataTransfer.types].includes("Files")) {
            event.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropping(false);
          actions.dropFiles(entry.id, event.dataTransfer.files, pointOnPage(event, inner.current, entry, scale));
        }}
        className={cn(
          "absolute top-1/2 left-1/2 overflow-hidden bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_6px_24px_rgb(0_0_0/0.08)]",
          tool === "text" && "cursor-text",
          DRAW_TOOLS.has(tool) && "cursor-crosshair touch-none",
          dropping && "ring-4 ring-data/40",
        )}
        style={{ width, height, transform: `translate(-50%, -50%) rotate(${entry.rotation}deg)` }}
      >
        {entry.index !== null && <canvas ref={canvas} className="absolute inset-0 size-full" />}
        {entry.index !== null && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-4">
            <Spinner className="size-[2rem]" />
          </div>
        )}

        {objects.map((object) => object.cover && <CoverPatch key={`c-${object.id}`} cover={object.cover} scale={scale} />)}

        {editMode &&
          lines?.map(
            (line) =>
              !editedLines.has(line.id) && (
                <button
                  key={line.id}
                  type="button"
                  title="Edit this text"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.editLine(entry, line, canvas.current);
                  }}
                  className="absolute rounded-[2px] bg-data/8 outline-1 outline-data/35 transition-colors outline-dashed hover:bg-data/15 hover:outline-data"
                  style={{
                    left: (line.x - 1) * scale,
                    top: (line.y - 1) * scale,
                    width: (line.width + 2) * scale,
                    height: (line.height + 2) * scale,
                  }}
                />
              ),
          )}

        {objects.map((object) => (
          <PdfObject
            key={object.id}
            object={object}
            scale={scale}
            rotation={entry.rotation}
            selected={object.id === selectedId}
            editing={object.id === editingId}
            interactive={interactive}
            actions={actions}
          />
        ))}

        {draft && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-data bg-data/10"
            style={{ left: draft.x * scale, top: draft.y * scale, width: draft.w * scale, height: draft.h * scale }}
          />
        )}
      </div>
      <span className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-2xs font-medium text-ink-4 tabular-nums">
        {number}
      </span>
    </div>
  );
}
