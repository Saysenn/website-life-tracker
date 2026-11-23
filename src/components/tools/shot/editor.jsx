"use client";

import {
  Circle,
  Crop,
  Eraser,
  Focus,
  Grid3x3,
  Highlighter,
  ListOrdered,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Pipette,
  Redo2,
  Ruler,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/tooltip";
import {
  backdropCss,
  backdropLayout,
  boundsOf,
  COLORS,
  colorAt,
  drawScene,
  edgeColor,
  hex,
  hits,
  isBox,
  isLine,
  moved,
  norm,
  scanEdges,
  strokeWidth,
  textSize,
  unitFor,
} from "@/lib/tools/shot/render";
import { cn } from "@/lib/utils";

export const EDIT_TOOLS = [
  { id: "select", key: "v", label: "Select & move", icon: MousePointer2 },
  { id: "arrow", key: "a", label: "Arrow", icon: MoveUpRight },
  { id: "line", key: "l", label: "Line", icon: Minus },
  { id: "rect", key: "r", label: "Rectangle", icon: Square },
  { id: "oval", key: "o", label: "Oval", icon: Circle },
  { id: "highlight", key: "h", label: "Highlighter", icon: Highlighter },
  { id: "pen", key: "p", label: "Pen", icon: Pencil },
  { id: "text", key: "t", label: "Text", icon: Type },
  { id: "step", key: "n", label: "Numbered step", icon: ListOrdered },
  { id: "blur", key: "b", label: "Blur / pixelate", icon: Grid3x3 },
  { id: "erase", key: "e", label: "Smart erase — fills with the surrounding colour", icon: Eraser },
  { id: "spotlight", key: "s", label: "Spotlight — dims the rest", icon: Focus },
  { id: "crop", key: "c", label: "Crop", icon: Crop },
  { id: "picker", key: "i", label: "Colour picker — click to copy", icon: Pipette },
  { id: "ruler", key: "m", label: "Ruler — hover to measure to the edges, drag for a size", icon: Ruler },
];
const TOOL_BY_KEY = Object.fromEntries(EDIT_TOOLS.map((tool) => [tool.key, tool.id]));
const DRAW_TOOLS = new Set(["arrow", "line", "rect", "oval", "highlight", "pen", "blur", "erase", "spotlight"]);
const STEP_SCALE = { s: 0.8, m: 1, l: 1.35 };
const HANDLE = 7;

const newId = () => Math.random().toString(36).slice(2, 10);
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function snapAngle(start, point) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}

function squareFrom(start, point) {
  const side = Math.max(Math.abs(point.x - start.x), Math.abs(point.y - start.y));
  return { x: start.x + Math.sign(point.x - start.x || 1) * side, y: start.y + Math.sign(point.y - start.y || 1) * side };
}

function handlesOf(shape) {
  if (isLine(shape)) return { p1: [shape.x1, shape.y1], p2: [shape.x2, shape.y2] };
  if (isBox(shape)) {
    const b = norm(shape);
    return { nw: [b.x, b.y], ne: [b.x + b.w, b.y], sw: [b.x, b.y + b.h], se: [b.x + b.w, b.y + b.h] };
  }
  return {};
}

function resized(orig, handle, point) {
  if (isLine(orig)) return handle === "p1" ? { ...orig, x1: point.x, y1: point.y } : { ...orig, x2: point.x, y2: point.y };
  const b = norm(orig);
  const ax = handle.includes("w") ? b.x + b.w : b.x;
  const ay = handle.includes("n") ? b.y + b.h : b.y;
  return { ...orig, x: ax, y: ay, w: point.x - ax, h: point.y - ay };
}

function cropHandle(rect, p, slack) {
  const near = (a, b) => Math.abs(a - b) <= slack;
  const w = near(p.x, rect.x);
  const e = near(p.x, rect.x + rect.w);
  const n = near(p.y, rect.y);
  const s = near(p.y, rect.y + rect.h);
  const inX = p.x > rect.x - slack && p.x < rect.x + rect.w + slack;
  const inY = p.y > rect.y - slack && p.y < rect.y + rect.h + slack;
  const edge = `${n && inX ? "n" : s && inX ? "s" : ""}${w && inY ? "w" : e && inY ? "e" : ""}`;
  if (edge) return edge;
  if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) return "move";
  return null;
}

const CURSORS = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", move: "move" };

/**
 * The annotation editor: a canvas over the capture with shapes you can draw, select, move, resize,
 * restyle, undo and redo. `onModel` gets { shapes, crop } after every change.
 */
export function Editor({ doc, settings, onSettings, onModel, actions, active = true }) {
  const base = doc.base;
  const unit = unitFor(base.width, base.height);
  const stage = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [tool, setToolState] = useState("arrow");
  const [model, setModel] = useState(() => ({ shapes: doc.shapes ?? [], crop: doc.crop ?? null }));
  const [hist, setHist] = useState({ at: 0, len: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditingState] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [cropRect, setCropRect] = useState(null);
  const modelRef = useRef(model);
  const history = useRef({ stack: [model], at: 0 });
  const draft = useRef(null);
  const hover = useRef(null);
  const measure = useRef(null);
  const lastTool = useRef("arrow");
  // The text being typed, also kept in a ref: a click elsewhere and the box losing focus both
  // finish it, and only the first may add the shape.
  const editRef = useRef(null);
  const setEditing = (value) => {
    editRef.current = value;
    setEditingState(value);
  };

  // ---- Geometry ----
  const cropping = tool === "crop";
  const full = { x: 0, y: 0, w: base.width, h: base.height };
  const area = cropping ? full : model.crop ? norm(model.crop) : full;
  const backdrop = settings.backdrop;
  const layout = cropping ? backdropLayout(area.w, area.h, null) : backdropLayout(area.w, area.h, backdrop);
  const margin = 40;
  const fit = box.w ? Math.min((box.w - margin) / layout.width, (box.h - margin) / layout.height, 1 / (doc.dpr || 1)) : 0;
  const s = Math.max(0.01, fit * zoom);
  const disp = { w: area.w * s, h: area.h * s };
  const selected = model.shapes.find((shape) => shape.id === selectedId) ?? null;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- Model ----
  const commit = (next) => {
    const h = history.current;
    h.stack = [...h.stack.slice(0, h.at + 1), next].slice(-200);
    h.at = h.stack.length - 1;
    modelRef.current = next;
    setModel(next);
    setHist({ at: h.at, len: h.stack.length });
    onModel(next);
  };
  const go = (delta) => {
    const h = history.current;
    const at = h.at + delta;
    if (at < 0 || at >= h.stack.length) return;
    h.at = at;
    modelRef.current = h.stack[at];
    setModel(h.stack[at]);
    setHist({ at, len: h.stack.length });
    setSelectedId(null);
    onModel(h.stack[at]);
  };
  const setShapes = (shapes) => commit({ ...modelRef.current, shapes });
  const replaceShape = (shape) => setShapes(modelRef.current.shapes.map((entry) => (entry.id === shape.id ? shape : entry)));
  const removeShape = (id) => setShapes(modelRef.current.shapes.filter((entry) => entry.id !== id));

  // ---- Text ----
  const commitText = () => {
    const current = editRef.current;
    if (!current) return;
    setEditing(null);
    const text = current.text.replace(/\s+$/, "");
    const shapes = modelRef.current.shapes;
    if (!text) {
      if (current.id && shapes.some((shape) => shape.id === current.id)) removeShape(current.id);
      return;
    }
    const shape = { id: current.id ?? newId(), type: "text", x: current.x, y: current.y, text, color: current.color, size: current.size, bg: current.bg };
    if (shapes.some((entry) => entry.id === shape.id)) replaceShape(shape);
    else setShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  // ---- Tools ----
  const applyCrop = () => {
    const rect = cropRect ? norm(cropRect) : null;
    const isFull = !rect || (rect.x <= 0 && rect.y <= 0 && rect.w >= base.width && rect.h >= base.height);
    const crop = isFull || rect.w < 4 || rect.h < 4 ? null : { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    const before = modelRef.current.crop;
    if (JSON.stringify(before) !== JSON.stringify(crop)) commit({ ...modelRef.current, crop });
    setCropRect(null);
  };

  const setTool = (next) => {
    if (editing) commitText();
    if (tool === "crop" && next !== "crop") applyCrop();
    if (next === "crop") {
      setCropRect(modelRef.current.crop ? norm(modelRef.current.crop) : { x: 0, y: 0, w: base.width, h: base.height });
      if (tool !== "crop") lastTool.current = tool;
    }
    measure.current = null;
    hover.current = null;
    if (next !== "select" && !DRAW_TOOLS.has(next)) setSelectedId(null);
    setToolState(next);
  };

  const styleFor = (type) => {
    if (type === "text") return { color: settings.color, size: textSize(settings.textSize, unit), bg: settings.textBg };
    return { color: settings.color, width: strokeWidth(settings.size, unit) };
  };

  const restyle = (patch) => {
    onSettings(patch);
    if (!selected) return;
    const next = { ...selected };
    if (patch.color && "color" in selected) next.color = patch.color;
    if (patch.size) {
      if ("width" in selected) next.width = strokeWidth(patch.size, unit);
      if (selected.type === "step") next.r = 13 * unit * STEP_SCALE[patch.size];
    }
    if (patch.textSize && selected.type === "text") next.size = textSize(patch.textSize, unit);
    if ("textBg" in patch && selected.type === "text") next.bg = patch.textBg;
    if ("fill" in patch && (selected.type === "rect" || selected.type === "oval")) next.fill = patch.fill;
    if (patch.blurStyle && selected.type === "blur") next.style = patch.blurStyle;
    if (JSON.stringify(next) !== JSON.stringify(selected)) replaceShape(next);
  };

  // ---- Painting ----
  function paint() {
    const el = canvasRef.current;
    if (!el || disp.w < 1 || disp.h < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 8192 / disp.w, 8192 / disp.h);
    const bw = Math.max(1, Math.round(disp.w * ratio));
    const bh = Math.max(1, Math.round(disp.h * ratio));
    if (el.width !== bw) el.width = bw;
    if (el.height !== bh) el.height = bh;
    const ctx = el.getContext("2d");
    const k = bw / area.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(k, 0, 0, k, -area.x * k, -area.y * k);
    ctx.imageSmoothingQuality = "high";
    // Zoomed past 1:1, show crisp pixels rather than a blur.
    ctx.imageSmoothingEnabled = k < 1.5;

    const d = draft.current;
    let shapes = modelRef.current.shapes;
    if (d?.kind === "draw" && d.shape) shapes = [...shapes, d.shape];
    if ((d?.kind === "move" || d?.kind === "resize") && d.shape) shapes = shapes.map((shape) => (shape.id === d.shape.id ? d.shape : shape));
    if (editing?.id) shapes = shapes.filter((shape) => shape.id !== editing.id);
    drawScene(ctx, base, shapes, unit);

    const px = ratio / k;
    ctx.lineCap = "butt";

    // Selection.
    const sel = d?.shape && (d.kind === "move" || d.kind === "resize") ? d.shape : shapes.find((shape) => shape.id === selectedId);
    if (sel && !cropping) {
      const b = boundsOf(sel);
      const pad = 4 * px;
      ctx.save();
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = "#2f7de1";
      ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      ctx.setLineDash([]);
      for (const [hx, hy] of Object.values(handlesOf(sel))) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4.5 * px, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = "#2f7de1";
        ctx.stroke();
      }
      ctx.restore();
    }

    // Crop frame.
    if (cropping && cropRect) {
      const r = norm(cropRect);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, base.width, base.height);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "rgba(12,10,8,0.55)";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1 * px;
      ctx.beginPath();
      for (const t of [1 / 3, 2 / 3]) {
        ctx.moveTo(r.x + r.w * t, r.y);
        ctx.lineTo(r.x + r.w * t, r.y + r.h);
        ctx.moveTo(r.x, r.y + r.h * t);
        ctx.lineTo(r.x + r.w, r.y + r.h * t);
      }
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      const l = 14 * px;
      const t = 3.5 * px;
      for (const [cx, cy, dx, dy] of [
        [r.x, r.y, 1, 1],
        [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h, -1, -1],
      ]) {
        ctx.fillRect(dx > 0 ? cx - t : cx - l + t, dy > 0 ? cy - t : cy, l, t);
        ctx.fillRect(dx > 0 ? cx - t : cx, dy > 0 ? cy - t : cy - l + t, t, l);
      }
      ctx.restore();
    }

    const label = (text, x, y) => {
      ctx.save();
      ctx.font = `600 ${11 * px}px ui-sans-serif, system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 10 * px;
      const h = 18 * px;
      ctx.fillStyle = "rgba(30,27,22,0.9)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 5 * px);
      ctx.fill();
      ctx.fillStyle = "#fffdfa";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 5 * px, y + h / 2 + 0.5 * px);
      ctx.restore();
    };

    // Ruler.
    if (tool === "ruler") {
      const m = measure.current;
      if (m) {
        const r = norm({ x: m.start.x, y: m.start.y, w: m.end.x - m.start.x, h: m.end.y - m.start.y });
        ctx.save();
        ctx.fillStyle = "rgba(47,125,225,0.15)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = "#2f7de1";
        ctx.lineWidth = 1 * px;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
        label(`${Math.round(r.w)} × ${Math.round(r.h)}`, r.x + r.w + 6 * px, r.y + r.h + 6 * px);
      } else if (hover.current) {
        const e = scanEdges(base, hover.current.x, hover.current.y);
        ctx.save();
        ctx.strokeStyle = "#e5483b";
        ctx.lineWidth = 1 * px;
        ctx.beginPath();
        ctx.moveTo(e.left, e.y + 0.5);
        ctx.lineTo(e.right, e.y + 0.5);
        ctx.moveTo(e.x + 0.5, e.up);
        ctx.lineTo(e.x + 0.5, e.down);
        for (const x of [e.left, e.right]) {
          ctx.moveTo(x, e.y - 5 * px);
          ctx.lineTo(x, e.y + 5 * px);
        }
        for (const y of [e.up, e.down]) {
          ctx.moveTo(e.x - 5 * px, y);
          ctx.lineTo(e.x + 5 * px, y);
        }
        ctx.stroke();
        ctx.restore();
        label(`${e.right - e.left} × ${e.down - e.up}`, e.x + 8 * px, e.y + 8 * px);
      }
    }

    // Colour picker.
    if (tool === "picker" && hover.current) {
      const color = hex(colorAt(base, hover.current.x, hover.current.y));
      const x = hover.current.x + 14 * px;
      const y = hover.current.y + 14 * px;
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.roundRect(x, y, 22 * px, 22 * px, 5 * px);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      label(color.toUpperCase(), x + 28 * px, y + 2 * px);
    }
  }

  useEffect(() => {
    paint();
  });

  // ---- Pointer ----
  const toImage = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: area.x + ((event.clientX - rect.left) / rect.width) * area.w, y: area.y + ((event.clientY - rect.top) / rect.height) * area.h };
  };
  const slack = HANDLE / s;
  const topHit = (p) => [...modelRef.current.shapes].reverse().find((shape) => hits(shape, p.x, p.y, slack));
  const handleAt = (shape, p) => Object.entries(handlesOf(shape)).find(([, [hx, hy]]) => Math.hypot(p.x - hx, p.y - hy) <= slack * 1.4)?.[0];

  const startText = (p, shape) => {
    if (shape) {
      setSelectedId(shape.id);
      setEditing({ id: shape.id, x: shape.x, y: shape.y, text: shape.text, color: shape.color, size: shape.size, bg: shape.bg });
    } else {
      setEditing({ id: null, x: p.x, y: p.y, text: "", ...styleFor("text") });
    }
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (editing) {
      commitText();
      if (tool === "text") return;
    }
    const p = toImage(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "crop") {
      const rect = cropRect ? norm(cropRect) : full;
      const handle = cropHandle(rect, p, slack * 1.4);
      draft.current = { kind: "crop", start: p, handle: handle ?? "new", orig: rect };
      if (!handle) setCropRect({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (tool === "picker") {
      const color = hex(colorAt(base, p.x, p.y));
      if (event.shiftKey) {
        restyle({ color });
        toast.success(`Drawing in ${color.toUpperCase()}`);
      } else {
        navigator.clipboard?.writeText(color.toUpperCase()).then(
          () => toast.success(`Copied ${color.toUpperCase()}`, { description: "Shift-click to draw in this colour" }),
          () => toast.error("Couldn't copy"),
        );
      }
      return;
    }
    if (tool === "ruler") {
      draft.current = { kind: "measure" };
      measure.current = { start: p, end: p };
      paint();
      return;
    }
    if (tool === "text") {
      const hit = topHit(p);
      startText(p, hit?.type === "text" ? hit : null);
      return;
    }

    const sel = modelRef.current.shapes.find((shape) => shape.id === selectedId);
    if (sel) {
      const handle = handleAt(sel, p);
      if (handle) {
        draft.current = { kind: "resize", handle, orig: sel, shape: sel };
        return;
      }
      if (hits(sel, p.x, p.y, slack)) {
        draft.current = { kind: "move", start: p, orig: sel, shape: sel };
        return;
      }
    }
    if (tool === "select") {
      const hit = topHit(p);
      setSelectedId(hit?.id ?? null);
      if (hit) draft.current = { kind: "move", start: p, orig: hit, shape: hit };
      return;
    }
    if (tool === "step") {
      const n = Math.max(0, ...modelRef.current.shapes.filter((shape) => shape.type === "step").map((shape) => shape.n)) + 1;
      const shape = { id: newId(), type: "step", x: p.x, y: p.y, r: 13 * unit * STEP_SCALE[settings.size], n, color: settings.color };
      setShapes([...modelRef.current.shapes, shape]);
      setSelectedId(shape.id);
      return;
    }
    if (!DRAW_TOOLS.has(tool)) return;
    const id = newId();
    const style = styleFor(tool);
    let shape;
    if (tool === "arrow" || tool === "line") shape = { id, type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...style };
    else if (tool === "pen") shape = { id, type: "pen", points: [[p.x, p.y]], ...style };
    else if (tool === "rect" || tool === "oval") shape = { id, type: tool, x: p.x, y: p.y, w: 0, h: 0, fill: settings.fill, ...style };
    else if (tool === "highlight") shape = { id, type: "highlight", x: p.x, y: p.y, w: 0, h: 0, color: settings.color };
    else if (tool === "blur") shape = { id, type: "blur", x: p.x, y: p.y, w: 0, h: 0, style: settings.blurStyle };
    else if (tool === "erase") shape = { id, type: "erase", x: p.x, y: p.y, w: 0, h: 0, fill: "#ffffff" };
    else shape = { id, type: "spotlight", x: p.x, y: p.y, w: 0, h: 0 };
    draft.current = { kind: "draw", start: p, shape };
    setSelectedId(null);
  };

  const onPointerMove = (event) => {
    const p = toImage(event);
    const d = draft.current;
    const el = canvasRef.current;
    if (!d) {
      hover.current = p;
      if (tool === "ruler" || tool === "picker") {
        measure.current = null;
        paint();
      }
      // Cursor hints for handles and moving.
      let cursor = "";
      if (tool === "crop" && cropRect) cursor = CURSORS[cropHandle(norm(cropRect), p, slack * 1.4)] ?? "crosshair";
      else if (selected && handleAt(selected, p)) cursor = "grab";
      else if (selected && hits(selected, p.x, p.y, slack)) cursor = "move";
      else if (tool === "select") cursor = topHit(p) ? "move" : "default";
      else if (tool === "text") cursor = "text";
      el.style.cursor = cursor || "crosshair";
      return;
    }
    if (d.kind === "measure") {
      measure.current = { ...measure.current, end: event.shiftKey ? squareFrom(measure.current.start, p) : p };
    } else if (d.kind === "crop") {
      const o = d.orig;
      let r;
      if (d.handle === "new") {
        const end = event.shiftKey ? squareFrom(d.start, p) : p;
        r = norm({ x: d.start.x, y: d.start.y, w: end.x - d.start.x, h: end.y - d.start.y });
      } else if (d.handle === "move") {
        r = { ...o, x: Math.max(0, Math.min(base.width - o.w, o.x + p.x - d.start.x)), y: Math.max(0, Math.min(base.height - o.h, o.y + p.y - d.start.y)) };
      } else {
        let { x, y } = o;
        let x2 = o.x + o.w;
        let y2 = o.y + o.h;
        if (d.handle.includes("w")) x = p.x;
        if (d.handle.includes("e")) x2 = p.x;
        if (d.handle.includes("n")) y = p.y;
        if (d.handle.includes("s")) y2 = p.y;
        r = norm({ x, y, w: x2 - x, h: y2 - y });
      }
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      setCropRect({ x, y, w: Math.min(base.width, r.x + r.w) - x, h: Math.min(base.height, r.y + r.h) - y });
      return;
    } else if (d.kind === "move") {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (event.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      d.shape = moved(d.orig, dx, dy);
    } else if (d.kind === "resize") {
      const anchor = isLine(d.orig) ? (d.handle === "p1" ? { x: d.orig.x2, y: d.orig.y2 } : { x: d.orig.x1, y: d.orig.y1 }) : null;
      const point = event.shiftKey && anchor ? snapAngle(anchor, p) : p;
      d.shape = resized(d.orig, d.handle, point);
    } else if (d.kind === "draw") {
      const sh = d.shape;
      if (sh.type === "pen") {
        const last = sh.points[sh.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 1.5 / s) d.shape = { ...sh, points: [...sh.points, [p.x, p.y]] };
      } else if (isLine(sh)) {
        const end = event.shiftKey ? snapAngle(d.start, p) : p;
        d.shape = { ...sh, x2: end.x, y2: end.y };
      } else {
        const end = event.shiftKey ? squareFrom(d.start, p) : p;
        d.shape = { ...sh, w: end.x - d.start.x, h: end.y - d.start.y };
      }
    }
    paint();
  };

  const onPointerUp = () => {
    const d = draft.current;
    draft.current = null;
    if (!d) return;
    if (d.kind === "draw") {
      let shape = d.shape;
      const b = boundsOf(shape);
      const tiny = Math.max(b.w, b.h) < 3 / s;
      if (tiny && shape.type !== "pen") return paint();
      if (isBox(shape)) shape = { ...shape, ...norm(shape) };
      if (shape.type === "erase") shape = { ...shape, fill: edgeColor(base, shape) };
      setShapes([...modelRef.current.shapes, shape]);
      setSelectedId(shape.id);
    } else if ((d.kind === "move" || d.kind === "resize") && d.shape !== d.orig) {
      let shape = d.shape;
      if (isBox(shape)) shape = { ...shape, ...norm(shape) };
      if (shape.type === "erase") shape = { ...shape, fill: edgeColor(base, shape) };
      replaceShape(shape);
    } else if (d.kind === "crop") {
      const r = cropRect && norm(cropRect);
      if (!r || r.w < 4 || r.h < 4) setCropRect(d.orig);
    }
    paint();
  };

  const onDoubleClick = (event) => {
    if (tool === "crop") return applyCrop() ?? setToolState(lastTool.current);
    const p = toImage(event);
    const hit = topHit(p);
    if (hit?.type === "text") startText(p, hit);
  };

  // ---- Keys ----
  const keys = useRef(null);
  useEffect(() => {
    keys.current = (event) => {
      if (!active || isTyping(event.target) || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const run = (fn) => {
        event.preventDefault();
        fn();
      };
      if (mod && key === "z") return run(() => go(event.shiftKey ? 1 : -1));
      if (mod && key === "y") return run(() => go(1));
      if (mod && key === "c") {
        if (window.getSelection()?.toString()) return;
        return run(actions.copy);
      }
      if (mod && key === "s") return run(actions.save);
      if (mod && key === "a") return run(() => setTool("select"));
      if (mod || event.altKey) return;
      if (event.shiftKey && key === "p") return run(actions.pin);
      if (event.shiftKey && key === "t") return run(actions.ocr);
      if (event.shiftKey && key === "b") return run(actions.toggleBackdrop);
      if (event.key === "Escape") {
        if (tool === "crop") return run(() => setCropRect(null) ?? setToolState(lastTool.current));
        if (selectedId) return run(() => setSelectedId(null));
        return;
      }
      if (event.key === "Enter" && tool === "crop") return run(() => applyCrop() ?? setToolState(lastTool.current));
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) return run(() => (removeShape(selectedId), setSelectedId(null)));
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[event.key] && selected) {
        const n = (event.shiftKey ? 10 : 1) / Math.max(s, 0.25);
        return run(() => replaceShape(moved(selected, arrows[event.key][0] * n, arrows[event.key][1] * n)));
      }
      if (event.key === "+" || event.key === "=") return run(() => setZoom((z) => Math.min(z * 1.25, 16)));
      if (event.key === "-") return run(() => setZoom((z) => Math.max(z / 1.25, 0.25)));
      if (event.key === "0") return run(() => setZoom(1));
      if (/^[1-9]$/.test(event.key)) return run(() => restyle({ color: COLORS[Number(event.key) - 1] }));
      if (event.key === "[") return run(() => restyle({ size: settings.size === "l" ? "m" : "s", textSize: settings.textSize === "l" ? "m" : "s" }));
      if (event.key === "]") return run(() => restyle({ size: settings.size === "s" ? "m" : "l", textSize: settings.textSize === "s" ? "m" : "l" }));
      if (event.shiftKey) return;
      const next = TOOL_BY_KEY[key];
      if (next) run(() => setTool(next));
    };
  });
  useEffect(() => {
    const onKey = (event) => keys.current?.(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Wheel with ⌘ / Ctrl (or a pinch) zooms.
  useEffect(() => {
    const el = stage.current;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(16, z * (event.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- UI ----
  const shownType = selected?.type ?? tool;
  const showsWidth = ["arrow", "line", "rect", "oval", "pen", "step"].includes(shownType);
  const showsColor = !["blur", "erase", "spotlight", "crop", "picker", "ruler"].includes(shownType);
  const pct = Math.round(s * (doc.dpr || 1) * 100);
  const cropSize = cropping && cropRect ? norm(cropRect) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Tools */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface p-1 shadow-card">
        {EDIT_TOOLS.map((entry) => {
          const Icon = entry.icon;
          return (
            <Tooltip key={entry.id} label={`${entry.label}  ·  ${entry.key.toUpperCase()}`}>
              <button
                type="button"
                aria-label={entry.label}
                aria-pressed={tool === entry.id}
                onClick={() => setTool(entry.id)}
                className={cn("flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink", tool === entry.id && "bg-ink text-ground hover:bg-ink hover:text-ground")}
              >
                <Icon className="size-[1.7rem]" />
              </button>
            </Tooltip>
          );
        })}
        <span className="mx-1 h-6 w-px bg-grid" />
        <Tooltip label="Undo  ·  ⌘Z">
          <button type="button" aria-label="Undo" disabled={hist.at === 0} onClick={() => go(-1)} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover disabled:opacity-35">
            <Undo2 className="size-[1.7rem]" />
          </button>
        </Tooltip>
        <Tooltip label="Redo  ·  ⇧⌘Z">
          <button type="button" aria-label="Redo" disabled={hist.at >= hist.len - 1} onClick={() => go(1)} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover disabled:opacity-35">
            <Redo2 className="size-[1.7rem]" />
          </button>
        </Tooltip>
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(z / 1.25, 0.25))} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover">
            <ZoomOut className="size-[1.6rem]" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="h-9 min-w-14 rounded-lg px-1.5 text-xs font-semibold text-ink-2 tabular-nums hover:bg-hover" title="Fit (0)">
            {zoom === 1 ? "Fit" : `${pct}%`}
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(z * 1.25, 16))} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover">
            <ZoomIn className="size-[1.6rem]" />
          </button>
        </span>
      </div>

      {/* Style for the current tool or selected shape */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        {cropping ? (
          <>
            <span className="text-xs font-semibold text-ink-2 tabular-nums">{cropSize ? `${Math.round(cropSize.w)} × ${Math.round(cropSize.h)}` : ""}</span>
            <button type="button" onClick={() => setCropRect({ x: 0, y: 0, w: base.width, h: base.height })} className="h-8 rounded-lg bg-hover px-2.5 text-xs font-semibold hover:bg-selected">
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                applyCrop();
                setToolState(lastTool.current);
              }}
              className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-ground hover:bg-ink/85"
            >
              Apply · Enter
            </button>
            <span className="text-xs text-ink-3">Drag a new frame, or drag its edges · Shift for a square · Esc cancels</span>
          </>
        ) : (
          <>
            {showsColor && (
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
                {COLORS.map((color, i) => {
                  const current = (selected?.color ?? settings.color) === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      aria-label={`Colour ${i + 1}`}
                      title={`${color.toUpperCase()}  ·  ${i + 1}`}
                      onClick={() => restyle({ color })}
                      className={cn("size-6 rounded-full ring-1 ring-black/10 transition-transform", current ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-ground" : "hover:scale-110")}
                      style={{ background: color }}
                    />
                  );
                })}
                <label className="relative size-6 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ring-1 ring-black/10" title="Any colour">
                  <input type="color" value={selected?.color?.length === 7 ? selected.color : settings.color} onChange={(event) => restyle({ color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            )}
            {showsWidth && (
              <Pills
                label="Width"
                value={settings.size}
                onChange={(size) => restyle({ size })}
                options={[
                  ["s", "Thin"],
                  ["m", "Medium"],
                  ["l", "Thick"],
                ]}
              />
            )}
            {(shownType === "rect" || shownType === "oval") && (
              <Pills
                label="Style"
                value={selected ? (selected.fill ? "fill" : "line") : settings.fill ? "fill" : "line"}
                onChange={(v) => restyle({ fill: v === "fill" })}
                options={[
                  ["line", "Outline"],
                  ["fill", "Filled"],
                ]}
              />
            )}
            {shownType === "text" && (
              <>
                <Pills
                  label="Text size"
                  value={settings.textSize}
                  onChange={(textSize) => restyle({ textSize })}
                  options={[
                    ["s", "S"],
                    ["m", "M"],
                    ["l", "L"],
                  ]}
                />
                <Pills
                  label="Text style"
                  value={(selected ? selected.bg : settings.textBg) ? "label" : "plain"}
                  onChange={(v) => restyle({ textBg: v === "label" })}
                  options={[
                    ["plain", "Outlined"],
                    ["label", "Label"],
                  ]}
                />
              </>
            )}
            {shownType === "blur" && (
              <Pills
                label="Effect"
                value={selected?.style ?? settings.blurStyle}
                onChange={(blurStyle) => restyle({ blurStyle })}
                options={[
                  ["pixelate", "Pixelate"],
                  ["blur", "Blur"],
                ]}
              />
            )}
            <span className="text-xs text-ink-3">
              {
                {
                  select: "Click a shape to pick it · drag to move · Delete removes · arrows nudge",
                  step: "Click to drop the next number",
                  text: "Click to type · Enter adds · Shift+Enter for a new line",
                  erase: "Drag over something to paint it the surrounding colour",
                  spotlight: "Drag to keep an area bright and dim the rest",
                  picker: "Click to copy the colour · Shift-click to draw with it",
                  ruler: "Hover to measure to the nearest edges · drag to measure a box",
                  pen: "Draw freehand",
                }[shownType]
              }
              {selected && " · Shift-drag keeps it straight"}
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={stage} className="relative h-[min(72dvh,62rem)] min-h-[26rem] overflow-auto rounded-2xl bg-sunken [background-image:radial-gradient(var(--color-grid)_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="flex min-h-full min-w-full items-center justify-center p-5" style={{ width: Math.max(box.w, layout.width * s + margin), height: Math.max(box.h, layout.height * s + margin) }}>
          <div
            className="relative shrink-0 transition-[background] duration-200"
            style={{ width: layout.width * s, height: layout.height * s, background: !cropping && backdrop?.on ? backdropCss(backdrop.bg) : undefined }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                hover.current = null;
                if (!draft.current) paint();
              }}
              onDoubleClick={onDoubleClick}
              className="absolute block touch-none"
              style={{
                left: layout.x * s,
                top: layout.y * s,
                width: disp.w,
                height: disp.h,
                borderRadius: layout.radius * s,
                boxShadow: layout.shadow ? `0 ${layout.shadow * s * 0.35}px ${layout.shadow * s}px rgba(20,14,8,.35)` : undefined,
              }}
            />
            {editing && (
              <textarea
                ref={textRef}
                value={editing.text}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onBlur={commitText}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    commitText();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEditing(null);
                  }
                }}
                spellCheck={false}
                rows={Math.max(1, editing.text.split("\n").length)}
                placeholder="Type…"
                className="absolute z-10 min-w-24 resize-none overflow-hidden rounded-sm bg-white/10 p-0 leading-[1.25] font-semibold outline-1 outline-[#2f7de1] outline-dashed"
                style={{
                  left: layout.x * s + (editing.x - area.x) * s,
                  top: layout.y * s + (editing.y - area.y) * s + editing.size * s * 0.1,
                  fontSize: editing.size * s,
                  color: editing.color,
                  fieldSizing: "content",
                  textShadow: "0 0 2px rgba(255,255,255,.9)",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pills({ label, value, onChange, options }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 rounded-lg bg-hover p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("h-7 rounded-md px-2.5 text-xs font-semibold text-ink-3 hover:text-ink", value === v && "bg-surface text-ink shadow-card")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
