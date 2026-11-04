"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cssFamily, loadFont } from "@/lib/tools/pdf/fonts";
import { cn } from "@/lib/utils";

/** Screen-pixel delta → page-point delta, undoing the page's display rotation. */
export function toPageDelta(dx, dy, rotation, scale) {
  const r = (rotation * Math.PI) / 180;
  return [(dx * Math.cos(r) + dy * Math.sin(r)) / scale, (-dx * Math.sin(r) + dy * Math.cos(r)) / scale];
}

const CORNERS = [
  { key: "nw", sx: -1, sy: -1, className: "-top-[0.95rem] -left-[0.95rem] cursor-nwse-resize" },
  { key: "ne", sx: 1, sy: -1, className: "-top-[0.95rem] -right-[0.95rem] cursor-nesw-resize" },
  { key: "sw", sx: -1, sy: 1, className: "-bottom-[0.95rem] -left-[0.95rem] cursor-nesw-resize" },
  { key: "se", sx: 1, sy: 1, className: "-right-[0.95rem] -bottom-[0.95rem] cursor-nwse-resize" },
];

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function EditableText({ object, scale, onInput, onDone }) {
  const ref = useRef(null);
  const started = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    element.textContent = object.text;
    element.focus({ preventScroll: true });
    if (object.placeholder) {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    } else {
      placeCaretAtEnd(element);
    }
    // Only on mount: the element owns its text while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onInput={(event) => {
        onInput(event.currentTarget.innerText.replace(/\n$/, ""), !started.current);
        started.current = true;
      }}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.blur();
      }}
      className="min-w-[1ch] cursor-text whitespace-pre outline-none"
      style={textStyle(object, scale)}
    />
  );
}

const textStyle = (object, scale) => ({
  fontFamily: `"${cssFamily(object.font)}", sans-serif`,
  fontWeight: object.bold ? 700 : 400,
  fontStyle: object.italic ? "italic" : "normal",
  fontSize: object.size * scale,
  lineHeight: object.lineHeight,
  color: object.color,
  textAlign: object.align,
});

export function PdfObject({ object, scale, rotation, selected, editing, interactive, actions }) {
  const box = useRef(null);
  const gesture = useRef(null);

  useEffect(() => {
    if (object.type === "text") loadFont(object.font, object.bold, object.italic).catch(() => {});
  }, [object.type, object.font, object.bold, object.italic]);

  const isText = object.type === "text";
  const width = isText ? undefined : object.w * scale;
  const height = isText ? undefined : object.h * scale;

  const start = (event, mode, corner) => {
    if (!interactive || editing) return;
    event.stopPropagation();
    event.preventDefault();
    const wasSelected = selected;
    actions.select(object.id);
    const element = box.current;
    gesture.current = {
      mode,
      corner,
      wasSelected,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...object },
      size: { w: element.offsetWidth / scale, h: element.offsetHeight / scale },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event) => {
    const current = gesture.current;
    if (!current) return;
    const [dx, dy] = toPageDelta(event.clientX - current.startX, event.clientY - current.startY, rotation, scale);
    if (!current.moved) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 3) return;
      current.moved = true;
      actions.checkpoint();
    }
    const { origin, size, corner } = current;

    if (current.mode === "move") {
      actions.update(object.id, { x: origin.x + dx, y: origin.y + dy }, { record: false });
      return;
    }

    const keepAspect = isText || object.type === "image" || event.shiftKey;
    let w = Math.max(8, size.w + corner.sx * dx);
    let h = Math.max(8, size.h + corner.sy * dy);
    if (keepAspect) {
      const factor = Math.max(w / size.w, h / size.h);
      w = size.w * factor;
      h = size.h * factor;
    }
    const x = corner.sx < 0 ? origin.x + size.w - w : origin.x;
    const y = corner.sy < 0 ? origin.y + size.h - h : origin.y;
    if (isText) {
      actions.update(object.id, { x, y, size: Math.max(2, Math.round(origin.size * (w / size.w) * 10) / 10) }, { record: false });
    } else {
      actions.update(object.id, { x, y, w, h }, { record: false });
    }
  };

  const end = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current && !current.moved && current.wasSelected && isText) actions.startEditing(object.id);
  };

  const shapeStyle =
    object.type === "shape"
      ? object.kind === "whiteout"
        ? { background: object.fill }
        : object.kind === "highlight"
          ? { background: object.color, opacity: object.opacity, mixBlendMode: "multiply" }
          : {
              border: `${object.strokeWidth * scale}px solid ${object.color}`,
              background: object.fill ?? "transparent",
              borderRadius: object.kind === "ellipse" ? "50%" : 0,
              opacity: object.opacity,
            }
      : null;

  return (
    <div
      ref={box}
      data-object-id={object.id}
      onPointerDown={(event) => start(event, "move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => isText && interactive && actions.startEditing(object.id)}
      className={cn(
        "absolute touch-none select-none",
        interactive && !editing && "cursor-move",
        selected && "outline-2 outline-offset-2 outline-data",
        !selected && interactive && "hover:outline-1 hover:outline-offset-2 hover:outline-data/50",
      )}
      style={{
        left: object.x * scale,
        top: object.y * scale,
        width,
        height,
        opacity: object.type === "shape" ? undefined : object.opacity,
      }}
    >
      {isText &&
        (editing ? (
          <EditableText
            object={object}
            scale={scale}
            onInput={(text, first) => {
              if (first) actions.checkpoint();
              actions.update(object.id, { text, placeholder: false }, { record: false });
            }}
            onDone={() => actions.stopEditing(object.id)}
          />
        ) : (
          <div className="whitespace-pre" style={textStyle(object, scale)}>
            {object.text || "​"}
          </div>
        ))}

      {object.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={object.src} alt="" draggable={false} className="pointer-events-none size-full" />
      )}

      {object.type === "shape" && <div className="pointer-events-none size-full" style={shapeStyle} />}

      {selected &&
        !editing &&
        interactive &&
        CORNERS.map((corner) => (
          <span
            key={corner.key}
            onPointerDown={(event) => start(event, "resize", corner)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={cn(
              "absolute z-10 size-4 touch-none rounded-full border-2 border-data bg-surface shadow-card",
              "after:absolute after:-inset-2.5 after:content-['']",
              corner.className,
            )}
          />
        ))}
    </div>
  );
}

/** The patch drawn over an original line of text that has been edited. */
export function CoverPatch({ cover, scale }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: cover.x * scale, top: cover.y * scale, width: cover.w * scale, height: cover.h * scale, background: cover.color }}
    />
  );
}
