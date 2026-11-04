import { matchPdfFont } from "./fonts";

const ASSETS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438";

let pdfjsPromise;

/** pdf.js is browser-only, so it is loaded on demand. */
export function getPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

export async function openPdf(bytes) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    fontExtraProperties: true,
    // Fonts PDFs reference but don't embed (Helvetica, Times…), CJK maps and image decoders.
    standardFontDataUrl: `${ASSETS}/standard_fonts/`,
    cMapUrl: `${ASSETS}/cmaps/`,
    cMapPacked: true,
    wasmUrl: `${ASSETS}/wasm/`,
    iccUrl: `${ASSETS}/iccs/`,
  });
  task.onPassword = () => {
    task.destroy();
  };
  try {
    return await task.promise;
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("Password-protected PDFs can't be edited yet");
    throw new Error("This file couldn't be opened as a PDF");
  }
}

/** Page sizes (in points, at the page's own rotation) for every page. */
export async function readPageSizes(doc) {
  const sizes = [];
  for (let index = 0; index < doc.numPages; index++) {
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    sizes.push({ width: viewport.width, height: viewport.height, rotation: page.rotate });
  }
  return sizes;
}

/** Renders a page into a canvas at `scale` (CSS px per point) × devicePixelRatio. Returns a cancel function. */
export function renderPage(doc, pageIndex, canvas, scale) {
  let task;
  let cancelled = false;
  const done = (async () => {
    const page = await doc.getPage(pageIndex + 1);
    if (cancelled) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = page.getViewport({ scale: scale * ratio });
    const scratch = document.createElement("canvas");
    scratch.width = Math.floor(viewport.width);
    scratch.height = Math.floor(viewport.height);
    task = page.render({ canvas: scratch, canvasContext: scratch.getContext("2d"), viewport });
    await task.promise;
    if (cancelled) return;
    canvas.width = scratch.width;
    canvas.height = scratch.height;
    canvas.getContext("2d").drawImage(scratch, 0, 0);
  })().catch((error) => {
    if (error?.name !== "RenderingCancelledException") throw error;
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** Resolves pdf.js's loaded font object (needs fontExtraProperties) without hanging. */
async function fontInfo(page, id) {
  const font = await Promise.race([
    new Promise((resolve) => {
      try {
        page.commonObjs.get(id, resolve);
      } catch {
        resolve(null);
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
  return { name: font?.name ?? "", bold: Boolean(font?.bold || font?.black), italic: Boolean(font?.italic), serif: Boolean(font?.isSerifFont), mono: Boolean(font?.isMonospace) };
}

/**
 * Finds the text lines on a page so they can be edited. Each line has its
 * box (points, top-left origin), baseline, size, matched font and the text.
 */
export async function extractLines(doc, pageIndex) {
  const pdfjs = await getPdfjs();
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // Fonts are only resolvable after the page has been parsed for rendering.
  await page.getOperatorList();

  const items = [];
  const fonts = {};
  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01 || tx[0] <= 0) continue; // rotated or mirrored text
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 2) continue;
    const style = content.styles[item.fontName] ?? {};
    const info = (fonts[item.fontName] ??= await fontInfo(page, item.fontName));
    const ascent = style.ascent || 0.8;
    const descent = style.descent || -0.2;
    items.push({
      text: item.str,
      left: tx[4],
      baseline: tx[5],
      width: item.width * viewport.scale,
      size,
      ascent,
      descent,
      fontName: item.fontName,
      ...matchPdfFont(info.name, info.mono ? "monospace" : info.serif ? "serif" : style.fontFamily, info),
    });
  }

  items.sort((a, b) => a.baseline - b.baseline || a.left - b.left);
  const lines = [];
  for (const item of items) {
    const line = lines.findLast(
      (candidate) =>
        Math.abs(candidate.baseline - item.baseline) < candidate.size * 0.3 &&
        Math.abs(candidate.size - item.size) < candidate.size * 0.2 &&
        item.left - candidate.right < candidate.size * 1.2 &&
        item.left - candidate.right > -candidate.size * 0.6,
    );
    if (line) {
      const gap = item.left - line.right;
      if (gap > line.size * 0.15 && !line.text.endsWith(" ") && !item.text.startsWith(" ")) line.text += " ";
      line.text += item.text;
      line.right = Math.max(line.right, item.left + item.width);
    } else {
      lines.push({ ...item, right: item.left + item.width });
    }
  }

  return lines.map((line, index) => ({
    id: `p${pageIndex}-l${index}`,
    text: line.text.replace(/\s+$/, ""),
    x: line.left,
    y: line.baseline - line.size * line.ascent,
    width: line.right - line.left,
    height: line.size * (line.ascent - line.descent),
    baseline: line.baseline,
    size: line.size,
    font: line.font,
    bold: line.bold,
    italic: line.italic,
  }));
}

/** Small preview image for the page list. */
export async function renderThumbnail(doc, pageIndex, width = 160) {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** Converts a point in page space (points, top-left origin, page's own rotation) into PDF user space. */
export function pdfPointConverter(doc, pageIndex) {
  return doc.getPage(pageIndex + 1).then((page) => {
    const viewport = page.getViewport({ scale: 1 });
    return (x, y) => viewport.convertToPdfPoint(x, y);
  });
}
