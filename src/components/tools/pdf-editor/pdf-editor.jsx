"use client";

import {
  ArrowLeft,
  Circle,
  Download,
  Eraser,
  Files,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Redo2,
  Signature,
  Square,
  TextCursorInput,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { Spinner } from "@/components/ui/spinner";
import { useHistory } from "@/hooks/use-history";
import { exportPdf } from "@/lib/tools/pdf/export";
import { baselineOffset, loadFont } from "@/lib/tools/pdf/fonts";
import { fileToAsset, loadImage, sampleColours } from "@/lib/tools/pdf/images";
import { extractLines, openPdf, pdfPointConverter, readPageSizes } from "@/lib/tools/pdf/pdfjs";
import { baseName, downloadBlob, readFile } from "@/lib/tools/files";
import { cn } from "@/lib/utils";
import { DropZone } from "../drop-zone";
import { ToolHeader } from "../tool-header";
import { BackgroundDialog } from "./background-dialog";
import { PagesPanel } from "./pages-panel";
import { PdfPage } from "./pdf-page";
import { toPageDelta } from "./pdf-object";
import { Properties } from "./properties";
import { SignatureDialog } from "./signature-dialog";

const EMPTY = { pages: [], objects: [] };
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(++counter).toString(36)}`;

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "edit", label: "Edit text", icon: TextCursorInput, hint: "Tap any text on the page to change it" },
  { id: "text", label: "Add text", icon: Type, hint: "Tap where you want to type" },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "sign", label: "Sign", icon: Signature },
  { id: "whiteout", label: "Whiteout", icon: Eraser, hint: "Drag over anything you want to hide" },
  { id: "highlight", label: "Highlight", icon: Highlighter, hint: "Drag over text to highlight it" },
  { id: "rect", label: "Box", icon: Square, hint: "Drag to draw a box" },
  { id: "ellipse", label: "Circle", icon: Circle, hint: "Drag to draw a circle" },
  { id: "pages", label: "Pages", icon: Files },
];

const SHAPES = {
  whiteout: { w: 120, h: 24, props: { fill: "#ffffff" } },
  highlight: { w: 140, h: 16, props: { color: "#ffe066", opacity: 0.45 } },
  rect: { w: 120, h: 80, props: { color: "#b42318", strokeWidth: 2, fill: null, opacity: 1 } },
  ellipse: { w: 100, h: 100, props: { color: "#b42318", strokeWidth: 2, fill: null, opacity: 1 } },
};

const STYLE_KEYS = ["text", "font", "bold", "italic", "size", "color", "x", "y", "align"];

function Toolbar({ tool, onTool }) {
  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 gap-0.5 overflow-x-auto border-t border-grid bg-surface px-2 py-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:w-[8.4rem] lg:flex-col lg:overflow-y-auto lg:border-t-0 lg:border-r lg:py-3"
    >
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTool(id)}
          aria-pressed={tool === id}
          className={cn(
            "flex min-w-[6.4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-2xs font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink lg:min-w-0",
            tool === id && "bg-ink text-ground hover:bg-ink hover:text-ground",
          )}
        >
          <Icon className="size-[2rem]" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 [&_svg]:size-[1.7rem]"
    >
      {children}
    </button>
  );
}

export function PdfEditor() {
  const [file, setFile] = useState(null);
  const [sources, setSourcesState] = useState([]);
  const sourcesRef = useRef([]);
  const setSources = (next) => {
    sourcesRef.current = next;
    setSourcesState(next);
  };
  const history = useHistory(EMPTY);
  const { state, set, checkpoint, undo, redo, reset, canUndo, canRedo } = history;
  const { pages, objects } = state;
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tool, setTool] = useState("select");
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [lines, setLines] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(0);
  const [signOpen, setSignOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [backgroundTarget, setBackgroundTarget] = useState(null);
  const scroller = useRef(null);
  const imageInput = useRef(null);
  const pendingLines = useRef(new Set());

  const scale = fit * zoom;
  const selected = objects.find((object) => object.id === selectedId) ?? null;
  const objectsByPage = useMemo(() => {
    const map = {};
    for (const object of objects) (map[object.page] ??= []).push(object);
    return map;
  }, [objects]);

  /* ---------- opening files ---------- */

  const loadSource = async (picked) => {
    const bytes = await readFile(picked);
    const pdf = await openPdf(bytes);
    const sizes = await readPageSizes(pdf);
    return { source: { bytes, pdf, name: picked.name }, sizes };
  };

  const open = async (files) => {
    const picked = [...files].find((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
    if (!picked) return toast.error("Choose a PDF file");
    setLoading(true);
    try {
      const { source, sizes } = await loadSource(picked);
      setSources([source]);
      setFile({ name: picked.name });
      setLines({});
      pendingLines.current.clear();
      reset({
        pages: sizes.map((size, index) => ({
          id: uid("pg"),
          source: 0,
          index,
          width: size.width,
          height: size.height,
          baseRotation: size.rotation,
          rotation: 0,
        })),
        objects: [],
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const appendPdfs = async (files) => {
    const pdfs = [...files].filter((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
    for (const picked of pdfs) {
      try {
        const { source, sizes } = await loadSource(picked);
        const sourceIndex = sourcesRef.current.length;
        setSources([...sourcesRef.current, source]);
        set((current) => ({
          ...current,
          pages: [
            ...current.pages,
            ...sizes.map((size, index) => ({
              id: uid("pg"),
              source: sourceIndex,
              index,
              width: size.width,
              height: size.height,
              baseRotation: size.rotation,
              rotation: 0,
            })),
          ],
        }));
        toast.success(`Added ${sizes.length} page${sizes.length === 1 ? "" : "s"} from ${picked.name}`);
      } catch (error) {
        toast.error(`${picked.name}: ${error.message}`);
      }
    }
  };

  /* ---------- layout ---------- */

  useEffect(() => {
    const element = scroller.current;
    if (!element || !pages.length) return;
    const widest = Math.max(...pages.map((entry) => (entry.rotation % 180 ? entry.height : entry.width)));
    const measure = () => setFit(Math.min((element.clientWidth - 24) / widest, 1.6));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pages]);

  /** The page most visible in the scroller. */
  const currentPage = useCallback(() => {
    const view = scroller.current?.getBoundingClientRect();
    let best = null;
    let bestArea = -1;
    for (const element of document.querySelectorAll("[data-page-id]")) {
      const rect = element.getBoundingClientRect();
      const area =
        Math.max(0, Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top)) *
        Math.max(0, Math.min(rect.right, view.right) - Math.max(rect.left, view.left));
      if (area > bestArea) {
        bestArea = area;
        best = element;
      }
    }
    if (!best) return null;
    const entry = pages.find((page) => page.id === best.dataset.pageId);
    // Centre of the visible part of that page, in page points.
    const rect = best.getBoundingClientRect();
    const cx = (Math.max(rect.left, view.left) + Math.min(rect.right, view.right)) / 2;
    const cy = (Math.max(rect.top, view.top) + Math.min(rect.bottom, view.bottom)) / 2;
    const [dx, dy] = toPageDelta(cx - (rect.left + rect.width / 2), cy - (rect.top + rect.height / 2), entry.rotation, scale);
    return { entry, point: [entry.width / 2 + dx, entry.height / 2 + dy] };
  }, [pages, scale]);

  /* ---------- object actions ---------- */

  const update = useCallback(
    (id, patch, options) =>
      set(
        (current) => ({
          ...current,
          objects: current.objects.map((object) => (object.id === id ? { ...object, ...patch } : object)),
        }),
        options,
      ),
    [set],
  );

  const add = useCallback(
    (object, { edit = false } = {}) => {
      set((current) => ({ ...current, objects: [...current.objects, object] }));
      setSelectedId(object.id);
      setEditingId(edit ? object.id : null);
    },
    [set],
  );

  const remove = useCallback(
    (id, options) => {
      set((current) => ({ ...current, objects: current.objects.filter((object) => object.id !== id) }), options);
      setSelectedId((current) => (current === id ? null : current));
      setEditingId((current) => (current === id ? null : current));
    },
    [set],
  );

  const deleteObject = useCallback(
    (id) => {
      const object = objects.find((item) => item.id === id);
      // Deleting edited original text leaves the patch, so the original stays erased.
      if (object?.cover) update(id, { text: "" });
      else remove(id);
    },
    [objects, update, remove],
  );

  const duplicate = useCallback(
    (id) => {
      const object = objects.find((item) => item.id === id);
      if (!object) return;
      const { cover: _cover, sourceLine: _sourceLine, origin: _origin, ...rest } = object;
      add({ ...rest, id: uid("ob"), x: object.x + 12, y: object.y + 12 });
    },
    [objects, add],
  );

  const layer = (id, direction) =>
    set((current) => {
      const object = current.objects.find((item) => item.id === id);
      const others = current.objects.filter((item) => item.id !== id);
      return { ...current, objects: direction > 0 ? [...others, object] : [object, ...others] };
    });

  /** Style change that keeps the text sitting on the same baseline. */
  const textStyle = async (object, patch) => {
    const next = { ...object, ...patch };
    try {
      await loadFont(next.font, next.bold, next.italic);
    } catch (error) {
      toast.error(error.message);
      return;
    }
    const baseline = object.y + baselineOffset(object);
    update(object.id, { ...patch, y: baseline - baselineOffset(next) });
  };

  const actions = {
    select: (id) => {
      setSelectedId(id);
      if (id !== editingId) setEditingId(null);
    },
    update,
    checkpoint,
    startEditing: (id) => {
      setSelectedId(id);
      setEditingId(id);
    },
    stopEditing: (id) => {
      setEditingId((current) => (current === id ? null : current));
      const object = objects.find((item) => item.id === id);
      if (!object) return;
      if (object.placeholder || (!object.text.trim() && !object.cover)) {
        remove(id, { record: false });
        return;
      }
      // Opened an original line but changed nothing: put the original back untouched.
      if (object.origin && STYLE_KEYS.every((key) => object[key] === object.origin[key])) remove(id, { record: false });
    },
    addText: async (pageId, x, y) => {
      const object = {
        id: uid("ob"),
        page: pageId,
        type: "text",
        text: "Type here",
        placeholder: true,
        font: "arimo",
        bold: false,
        italic: false,
        size: 14,
        color: "#000000",
        align: "left",
        lineHeight: 1.2,
        opacity: 1,
        x,
        y: y - 9,
      };
      setTool("select");
      add(object, { edit: true });
      loadFont("arimo").catch((error) => toast.error(error.message));
    },
    addShape: (pageId, kind, draft) => {
      const preset = SHAPES[kind];
      const tiny = draft.w < 4 && draft.h < 4;
      const box = tiny
        ? { x: draft.startX - preset.w / 2, y: draft.startY - preset.h / 2, w: preset.w, h: preset.h }
        : { x: draft.x, y: draft.y, w: draft.w, h: draft.h };
      add({ id: uid("ob"), page: pageId, type: "shape", kind, opacity: 1, ...preset.props, ...box });
    },
    editLine: async (entry, line, canvas) => {
      const existing = objects.find((object) => object.page === entry.id && object.sourceLine === line.id);
      if (existing) return actions.startEditing(existing.id);
      try {
        await loadFont(line.font, line.bold, line.italic);
      } catch (error) {
        toast.error(error.message);
        return;
      }
      const colours = canvas?.width ? sampleColours(canvas, line, canvas.width / entry.width) : { background: "#ffffff", text: "#000000" };
      const object = {
        id: uid("ob"),
        page: entry.id,
        type: "text",
        sourceLine: line.id,
        text: line.text,
        font: line.font,
        bold: line.bold,
        italic: line.italic,
        size: Math.round(line.size * 10) / 10,
        color: colours.text,
        align: "left",
        lineHeight: 1.15,
        opacity: 1,
        x: line.x,
        y: 0,
        cover: { x: line.x - 1, y: line.y - 1, w: line.width + 2, h: line.height + 2, color: colours.background },
      };
      object.y = line.baseline - baselineOffset(object);
      object.origin = Object.fromEntries(STYLE_KEYS.map((key) => [key, object[key]]));
      add(object, { edit: true });
    },
    requestLines: (entry) => {
      const key = `${entry.source}:${entry.index}`;
      if (pendingLines.current.has(key)) return;
      pendingLines.current.add(key);
      extractLines(sources[entry.source].pdf, entry.index)
        .then((found) => setLines((current) => ({ ...current, [key]: found })))
        .catch(() => setLines((current) => ({ ...current, [key]: [] })));
    },
    dropFiles: async (pageId, files, point) => {
      const list = [...files];
      const pdfs = list.filter((item) => item.type === "application/pdf");
      if (pdfs.length) appendPdfs(pdfs);
      for (const [index, item] of list.filter((entry) => entry.type.startsWith("image/")).entries()) {
        await placeImage(await fileToAsset(item), { pageId, point: [point[0] + index * 16, point[1] + index * 16] });
      }
    },
  };

  const placeImage = async (asset, { pageId, point, signature = false } = {}) => {
    const target = pageId ? { entry: pages.find((page) => page.id === pageId), point } : currentPage();
    if (!target?.entry) return;
    let { width, height } = asset;
    if (!width || !height) {
      const image = await loadImage(asset.src);
      width = image.naturalWidth;
      height = image.naturalHeight;
    }
    const maxWidth = signature ? 170 : target.entry.width * 0.5;
    const w = Math.min(maxWidth, width * 0.75);
    const h = (w * height) / width;
    const [cx, cy] = target.point;
    add({ id: uid("ob"), page: target.entry.id, type: "image", src: asset.src, opacity: 1, x: cx - w / 2, y: cy - h / 2, w, h });
    setTool("select");
  };

  /* ---------- page actions ---------- */

  const pageActions = {
    scrollTo: (id) => document.querySelector(`[data-page-id="${id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
    rotatePage: (id) =>
      set((current) => ({
        ...current,
        pages: current.pages.map((page) => (page.id === id ? { ...page, rotation: (page.rotation + 90) % 360 } : page)),
      })),
    deletePage: (id) =>
      set((current) => ({
        pages: current.pages.filter((page) => page.id !== id),
        objects: current.objects.filter((object) => object.page !== id),
      })),
    movePage: (index, direction) =>
      set((current) => {
        const next = [...current.pages];
        const [page] = next.splice(index, 1);
        next.splice(index + direction, 0, page);
        return { ...current, pages: next };
      }),
    duplicatePage: (index) =>
      set((current) => {
        const original = current.pages[index];
        const copy = { ...original, id: uid("pg") };
        const next = [...current.pages];
        next.splice(index + 1, 0, copy);
        const copies = current.objects
          .filter((object) => object.page === original.id)
          .map((object) => ({ ...object, id: uid("ob"), page: copy.id }));
        return { pages: next, objects: [...current.objects, ...copies] };
      }),
    addBlank: (at) =>
      set((current) => {
        const like = current.pages[Math.max(0, at - 1)] ?? { width: 595.28, height: 841.89, rotation: 0 };
        const blank = { id: uid("pg"), source: 0, index: null, width: like.width, height: like.height, baseRotation: 0, rotation: like.rotation };
        const next = [...current.pages];
        next.splice(at, 0, blank);
        return { ...current, pages: next };
      }),
    appendPdfs,
  };

  /* ---------- tools ---------- */

  const chooseTool = (id) => {
    setEditingId(null);
    if (id === "image") return imageInput.current?.click();
    if (id === "sign") return setSignOpen(true);
    if (id === "pages") return setPagesOpen(true);
    setTool((current) => (current === id && id !== "select" ? "select" : id));
    if (id !== "select" && id !== "edit") setSelectedId(null);
  };

  /* ---------- saving ---------- */

  const save = async () => {
    setEditingId(null);
    setSaving(0.01);
    try {
      const converters = {};
      for (const entry of pages) {
        if (entry.index !== null) converters[entry.id] = await pdfPointConverter(sources[entry.source].pdf, entry.index);
      }
      const bytes = await exportPdf({
        sources,
        pages,
        objects,
        converters,
        onProgress: (value) => setSaving(Math.max(0.01, value)),
      });
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${baseName(file.name)}-edited.pdf`);
      toast.success("PDF saved");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Couldn't save the PDF");
    } finally {
      setSaving(0);
    }
  };

  /* ---------- keyboard + leave warning ---------- */

  useEffect(() => {
    const onKey = (event) => {
      const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y" && !typing) {
        event.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
      if (!selectedId) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteObject(selectedId);
      } else if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate(selectedId);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const object = objects.find((item) => item.id === selectedId);
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        update(selectedId, { x: object.x + dx, y: object.y + dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, objects, undo, redo, deleteObject, duplicate, update]);

  useEffect(() => {
    if (!canUndo) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [canUndo]);

  /* ---------- render ---------- */

  if (!file) {
    return (
      <Page className="max-w-[76rem]">
        <ToolHeader
          icon="pdf"
          title="PDF editor"
          description="Change existing text, add text, images and signatures, hide or highlight content, and rearrange pages."
        />
        <div className="mt-5">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-surface shadow-card">
              <Spinner className="size-[2.4rem]" />
              <p className="text-sm text-ink-3">Opening PDF…</p>
            </div>
          ) : (
            <DropZone onFiles={open} accept="application/pdf,.pdf" title="Choose a PDF" hint="or drop it here" note="Stays on your device" />
          )}
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {[
            ["Edit existing text", "Tap a line, retype it, change font, size and colour."],
            ["Sign anywhere", "Draw, type, or snap a photo — background removed automatically."],
            ["Drag & drop images", "Drop logos or stamps on a page, then move and resize them."],
            ["Organise pages", "Rotate, reorder, duplicate, delete, add blank pages or merge PDFs."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs text-ink-3">{body}</p>
            </li>
          ))}
        </ul>
      </Page>
    );
  }

  const activeHint = TOOLS.find((item) => item.id === tool)?.hint;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-1 border-b border-grid bg-surface px-2 sm:px-3">
        <Link
          href="/tools"
          aria-label="Back to tools"
          className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover"
        >
          <ArrowLeft className="size-[1.7rem]" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={file.name}>
          {file.name}
        </p>
        <IconButton label="Undo" onClick={undo} disabled={!canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" onClick={redo} disabled={!canRedo}>
          <Redo2 />
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-grid sm:block" />
        <IconButton label="Zoom out" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]}>
          <ZoomOut />
        </IconButton>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="hidden w-12 text-center text-xs font-medium text-ink-2 tabular-nums sm:block"
          title="Fit width"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          label="Zoom in"
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}
          disabled={zoom === ZOOMS.at(-1)}
        >
          <ZoomIn />
        </IconButton>
        <button
          type="button"
          onClick={save}
          disabled={Boolean(saving)}
          className="ml-1 flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-ground transition-colors hover:bg-ink/85 disabled:opacity-60"
        >
          {saving ? <Spinner className="size-[1.5rem]" /> : <Download className="size-[1.6rem]" />}
          <span className="hidden sm:inline">{saving ? `Saving ${Math.round(saving * 100)}%` : "Download"}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <Toolbar tool={tool} onTool={chooseTool} />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-auto bg-sunken"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedId(null);
            }}
          >
            <div className="flex w-max min-w-full flex-col items-center gap-9 px-3 pt-4 pb-12">
              {pages.map((entry, index) => {
                const key = `${entry.source}:${entry.index}`;
                return (
                  <PdfPage
                    key={entry.id}
                    entry={entry}
                    number={index + 1}
                    pdf={sources[entry.source]?.pdf}
                    scale={scale}
                    objects={objectsByPage[entry.id] ?? []}
                    selectedId={selectedId}
                    editingId={editingId}
                    tool={tool}
                    lines={lines[key]}
                    actions={actions}
                  />
                );
              })}
            </div>
          </div>

          {activeHint && (
            <p className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 animate-pop rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-ground shadow-float">
              {activeHint}
            </p>
          )}

          {selected && (
            <div className="shrink-0 border-t border-grid bg-surface lg:hidden">
              <Properties
                object={selected}
                onChange={update}
                onTextStyle={textStyle}
                onDuplicate={duplicate}
                onDelete={deleteObject}
                onLayer={layer}
                onRemoveBackground={setBackgroundTarget}
                onRestore={(id) => remove(id)}
              />
            </div>
          )}
        </div>

        {selected && (
          <aside className="hidden w-[28rem] shrink-0 overflow-y-auto border-l border-grid bg-surface lg:block">
            <Properties
              object={selected}
              onChange={update}
              onTextStyle={textStyle}
              onDuplicate={duplicate}
              onDelete={deleteObject}
              onLayer={layer}
              onRemoveBackground={setBackgroundTarget}
              onRestore={(id) => remove(id)}
            />
          </aside>
        )}
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={async (event) => {
          const list = [...event.target.files];
          event.target.value = "";
          for (const item of list) {
            try {
              await placeImage(await fileToAsset(item));
            } catch (error) {
              toast.error(error.message);
            }
          }
        }}
      />

      <SignatureDialog open={signOpen} onOpenChange={setSignOpen} onUse={(asset) => placeImage(asset, { signature: true })} />

      <BackgroundDialog
        image={backgroundTarget}
        onOpenChange={(value) => !value && setBackgroundTarget(null)}
        onApply={(result) => {
          const target = backgroundTarget;
          if (!target) return;
          if (!result) {
            if (target.originalSrc) update(target.id, { src: target.originalSrc });
            return;
          }
          update(target.id, {
            src: result.src,
            originalSrc: target.originalSrc ?? target.src,
            h: (target.w * result.height) / result.width,
          });
        }}
      />

      <PagesPanel open={pagesOpen} onOpenChange={setPagesOpen} pages={pages} sources={sources} actions={pageActions} />

      {saving > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-hover">
          <div className="h-full bg-data transition-[width]" style={{ width: `${saving * 100}%` }} />
        </div>
      )}
    </div>
  );
}
