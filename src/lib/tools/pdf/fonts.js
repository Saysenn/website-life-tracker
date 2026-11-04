/*
 * Fonts used by the PDF editor. The same TTF file is loaded into the page
 * (FontFace) and embedded in the exported PDF, so what you see is what you get.
 * Arimo / Tinos / Cousine / Carlito / Caladea are metric-compatible with
 * Arial / Times / Courier / Calibri / Cambria, so replaced text keeps its width.
 */

export const FONTS = [
  { id: "arimo", label: "Arial", group: "Document" },
  { id: "tinos", label: "Times New Roman", group: "Document" },
  { id: "carlito", label: "Calibri", group: "Document" },
  { id: "caladea", label: "Cambria", group: "Document" },
  { id: "cousine", label: "Courier", group: "Document" },
  { id: "inter", label: "Inter", group: "Modern" },
  { id: "roboto", label: "Roboto", group: "Modern" },
  { id: "open-sans", label: "Open Sans", group: "Modern" },
  { id: "lato", label: "Lato", group: "Modern" },
  { id: "montserrat", label: "Montserrat", group: "Modern" },
  { id: "poppins", label: "Poppins", group: "Modern" },
  { id: "merriweather", label: "Merriweather", group: "Serif" },
  { id: "lora", label: "Lora", group: "Serif" },
  { id: "playfair-display", label: "Playfair Display", group: "Serif" },
  { id: "dancing-script", label: "Dancing Script", group: "Signature", script: true },
  { id: "great-vibes", label: "Great Vibes", group: "Signature", script: true },
  { id: "caveat", label: "Caveat", group: "Signature", script: true },
  { id: "sacramento", label: "Sacramento", group: "Signature", script: true },
  { id: "homemade-apple", label: "Homemade Apple", group: "Signature", script: true },
];

export const SIGNATURE_FONTS = FONTS.filter((font) => font.script);
export const fontLabel = (id) => FONTS.find((font) => font.id === id)?.label ?? id;

const url = (id, weight, style) => `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-${style}.ttf`;
export const cssFamily = (id) => `pdfed-${id}`;

const cache = new Map();

/** Loads a font variant into the page and returns { bytes, family, weight, style } (falls back to regular). */
export function loadFont(id, bold = false, italic = false) {
  const key = `${id}:${bold}:${italic}`;
  if (!cache.has(key)) {
    const promise = (async () => {
      const attempts = [
        [bold ? 700 : 400, italic ? "italic" : "normal"],
        [bold ? 700 : 400, "normal"],
        [400, "normal"],
      ];
      for (const [weight, style] of attempts) {
        const response = await fetch(url(id, weight, style)).catch(() => null);
        if (!response?.ok) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const descriptors = { weight: String(bold ? 700 : 400), style: italic ? "italic" : "normal" };
        const face = new FontFace(cssFamily(id), bytes, descriptors);
        await face.load();
        document.fonts.add(face);
        return { bytes, family: cssFamily(id), weight: descriptors.weight, style: descriptors.style };
      }
      throw new Error(`Couldn't load the ${fontLabel(id)} font — check your connection`);
    })();
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

export const cssFont = (object, size = object.size) =>
  `${object.italic ? "italic " : ""}${object.bold ? 700 : 400} ${size}px "${cssFamily(object.font)}"`;

let measureContext;
/** Where the first baseline sits inside a CSS line box — used for both placement and export so they agree. */
export function baselineOffset(object) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  measureContext.font = cssFont(object, 100);
  const metrics = measureContext.measureText("Hg");
  const ascent = (metrics.fontBoundingBoxAscent ?? 80) / 100;
  const descent = (metrics.fontBoundingBoxDescent ?? 20) / 100;
  const lineBox = object.lineHeight * object.size;
  return (lineBox - (ascent + descent) * object.size) / 2 + ascent * object.size;
}

/** Best match for a font name found inside a PDF (e.g. "ABCDEF+Calibri-Bold"). */
export function matchPdfFont(name = "", family = "", flags = {}) {
  const clean = name.replace(/^[A-Z]{6}\+/, "");
  const bold = Boolean(flags.bold) || /bold|black|heavy|semibold|demi/i.test(clean);
  const italic = Boolean(flags.italic) || /italic|oblique/i.test(clean);
  const rules = [
    [/calibri/i, "carlito"],
    [/cambria/i, "caladea"],
    [/courier|mono|consol|menlo/i, "cousine"],
    [/roboto/i, "roboto"],
    [/inter\b|inter-/i, "inter"],
    [/open ?sans/i, "open-sans"],
    [/lato/i, "lato"],
    [/montserrat/i, "montserrat"],
    [/poppins/i, "poppins"],
    [/merriweather/i, "merriweather"],
    [/lora/i, "lora"],
    [/playfair/i, "playfair-display"],
    [/times|georgia|garamond|minion|book ?antiqua|palatino|serif/i, "tinos"],
    [/arial|helvetica|verdana|tahoma|segoe|sans|frutiger|myriad/i, "arimo"],
  ];
  const hit = rules.find(([pattern]) => pattern.test(clean));
  let font = hit?.[1];
  if (!font) font = family === "serif" ? "tinos" : family === "monospace" ? "cousine" : "arimo";
  return { font, bold, italic };
}
