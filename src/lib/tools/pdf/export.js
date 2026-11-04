import { baselineOffset, loadFont } from "./fonts";

const hexToRgb = (rgb, hex = "#000000") => {
  const value = hex.replace("#", "");
  return rgb(...[0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255));
};

const dataUrlBytes = (src) => {
  const base64 = src.slice(src.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Builds the edited PDF.
 * - sources: [{ bytes }] — original files (pages can come from several)
 * - pages:   [{ id, source, index|null, width, height, baseRotation, rotation }]
 * - objects: editor objects in page space (points, top-left origin)
 * - converters: { [pageId]: (x, y) => [pdfX, pdfY] }
 */
export async function exportPdf({ sources, pages, objects, converters, title, onProgress = () => {} }) {
  const { PDFDocument, rgb, degrees, BlendMode } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;

  const loaded = await Promise.all(sources.map((source) => PDFDocument.load(source.bytes, { updateMetadata: false })));
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setProducer("");
  out.setCreator("");
  if (title) out.setTitle(title);

  const fonts = new Map();
  const embedFont = async (object) => {
    const key = `${object.font}:${object.bold}:${object.italic}`;
    if (!fonts.has(key)) {
      const { bytes } = await loadFont(object.font, object.bold, object.italic);
      fonts.set(key, await out.embedFont(bytes, { subset: false }));
    }
    return fonts.get(key);
  };
  const images = new Map();
  const embedImage = async (src) => {
    if (!images.has(src)) {
      const bytes = dataUrlBytes(src);
      images.set(src, src.startsWith("data:image/jpeg") ? await out.embedJpg(bytes) : await out.embedPng(bytes));
    }
    return images.get(src);
  };

  for (const [position, entry] of pages.entries()) {
    let page;
    if (entry.index === null) {
      page = out.addPage([entry.width, entry.height]);
    } else {
      [page] = await out.copyPages(loaded[entry.source], [entry.index]);
      out.addPage(page);
    }
    page.setRotation(degrees((entry.baseRotation + entry.rotation) % 360));

    const convert = converters[entry.id] ?? ((x, y) => [x, entry.height - y]);
    const rotate = degrees(entry.baseRotation);
    const anchor = (box) => convert(box.x, box.y + box.h);

    for (const object of objects.filter((item) => item.page === entry.id)) {
      const opacity = object.opacity ?? 1;

      if (object.cover) {
        const [x, y] = anchor(object.cover);
        page.drawRectangle({ x, y, width: object.cover.w, height: object.cover.h, color: hexToRgb(rgb, object.cover.color), rotate });
      }

      if (object.type === "text" && object.text.trim()) {
        const font = await embedFont(object);
        const lines = object.text.split("\n");
        const widths = lines.map((line) => font.widthOfTextAtSize(line, object.size));
        const boxWidth = Math.max(...widths);
        const base = baselineOffset(object);
        lines.forEach((line, index) => {
          if (!line) return;
          const shift =
            object.align === "center" ? (boxWidth - widths[index]) / 2 : object.align === "right" ? boxWidth - widths[index] : 0;
          const [x, y] = convert(object.x + shift, object.y + base + index * object.lineHeight * object.size);
          page.drawText(line, { x, y, size: object.size, font, color: hexToRgb(rgb, object.color), opacity, rotate });
        });
      }

      if (object.type === "image") {
        const image = await embedImage(object.src);
        const [x, y] = anchor(object);
        page.drawImage(image, { x, y, width: object.w, height: object.h, opacity, rotate });
      }

      if (object.type === "shape") {
        const filled = object.kind !== "rect" && object.kind !== "ellipse" ? true : Boolean(object.fill);
        const common = {
          color: filled ? hexToRgb(rgb, object.fill ?? object.color) : undefined,
          borderColor: object.kind === "rect" || object.kind === "ellipse" ? hexToRgb(rgb, object.color) : undefined,
          borderWidth: object.kind === "rect" || object.kind === "ellipse" ? object.strokeWidth : 0,
          opacity: filled ? opacity : undefined,
          borderOpacity: opacity,
          rotate,
          blendMode: object.kind === "highlight" ? BlendMode.Multiply : undefined,
        };
        if (object.kind === "ellipse") {
          const [x, y] = convert(object.x + object.w / 2, object.y + object.h / 2);
          page.drawEllipse({ ...common, x, y, xScale: object.w / 2, yScale: object.h / 2 });
        } else {
          const [x, y] = anchor(object);
          page.drawRectangle({ ...common, x, y, width: object.w, height: object.h });
        }
      }
    }
    onProgress((position + 1) / pages.length);
  }

  return out.save();
}
