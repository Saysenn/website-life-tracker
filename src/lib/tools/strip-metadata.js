import { extensionOf, readFile } from "./files";

/*
 * Removes embedded metadata in the browser. Every cleaner works on the raw
 * bytes so images, audio and video are never re-encoded (no quality loss).
 * Each returns { bytes, removed: string[] } — `removed` lists what was found.
 */

const latin = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const startsWith = (bytes, text, at = 0) => latin(bytes, at, text.length) === text;
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const includesText = (bytes, text) => {
  const needle = [...text].map((char) => char.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/* ---------- EXIF (TIFF) tag sniffing, to tell the user what was inside ---------- */

const TAG_LABELS = {
  0x010f: "Camera make",
  0x0110: "Camera model",
  0x0131: "Software",
  0x0132: "Date taken",
  0x013b: "Author",
  0x8298: "Copyright",
  0x8769: "Camera settings",
  0x8825: "GPS location",
  0xa430: "Owner name",
  0xa431: "Serial number",
};

function readTiff(bytes) {
  const found = new Set();
  let orientation = 1;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = view.getUint16(0) === 0x4949;
    const ifd = view.getUint32(4, little);
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      const tag = view.getUint16(entry, little);
      if (tag === 0x0112) orientation = view.getUint16(entry + 8, little);
      if (TAG_LABELS[tag]) found.add(TAG_LABELS[tag]);
    }
  } catch {
    // Unreadable EXIF is still removed; we just can't describe it.
  }
  return { found: [...found], orientation };
}

/** A tiny EXIF block that only keeps the rotation, so photos don't flip sideways. */
function orientationOnlyExif(orientation) {
  const body = [
    ..."Exif\0\0".split("").map((char) => char.charCodeAt(0)),
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header, little endian
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...body]);
}

/* ---------- JPEG ---------- */

function cleanJpeg(bytes) {
  const removed = new Set();
  const parts = [bytes.subarray(0, 2)];
  let orientation = 1;
  let i = 2;
  let insertAt = 1;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("This JPEG looks damaged");
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: copy image data up to the end-of-image marker, drop anything after it.
      let end = i + 2;
      while (end < bytes.length - 1 && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) end += 1;
      end = Math.min(end + 2, bytes.length);
      parts.push(bytes.subarray(i, end));
      if (bytes.length - end > 16) removed.add("Embedded extra images");
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) throw new Error("This JPEG looks damaged or incomplete");
    const segment = bytes.subarray(i, i + 2 + length);
    const id = latin(bytes, i + 4, 14);
    let keep = true;

    if (marker === 0xe1) {
      keep = false;
      if (id.startsWith("Exif")) {
        const tiff = readTiff(bytes.subarray(i + 10, i + 2 + length));
        orientation = tiff.orientation;
        removed.add("EXIF");
        tiff.found.forEach((label) => removed.add(label));
      } else {
        removed.add("XMP");
      }
    } else if (marker === 0xed) {
      keep = false;
      removed.add("IPTC / Photoshop");
    } else if (marker === 0xfe) {
      keep = false;
      removed.add("Comments");
    } else if (marker === 0xe2) {
      keep = id.startsWith("ICC_PROFILE"); // colour profile, needed for correct colours
      if (!keep) removed.add("Extra app data");
    } else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) {
      keep = false;
      removed.add("Extra app data");
    }

    if (keep) {
      parts.push(segment);
      if (marker === 0xe0) insertAt = parts.length;
    }
    i += 2 + length;
  }
  if (!parts.some((part) => part[0] === 0xff && part[1] === 0xda)) throw new Error("This JPEG looks damaged or incomplete");

  if (orientation > 1 && orientation <= 8) parts.splice(insertAt, 0, orientationOnlyExif(orientation));
  return { bytes: concat(parts), removed: [...removed] };
}

/* ---------- PNG ---------- */

function cleanPng(bytes) {
  const removed = new Set();
  const parts = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = latin(bytes, i + 4, 4);
    const end = i + 12 + length;
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const keyword = latin(bytes, i + 8, Math.min(length, 20));
      removed.add(keyword.startsWith("XML:com.adobe.xmp") ? "XMP" : "Text tags");
    } else if (type === "eXIf") {
      removed.add("EXIF");
      readTiff(bytes.subarray(i + 8, i + 8 + length)).found.forEach((label) => removed.add(label));
    } else if (type === "tIME") {
      removed.add("Edit date");
    } else {
      parts.push(bytes.subarray(i, end));
    }
    i = end;
    if (type === "IEND") break;
  }
  return { bytes: concat(parts), removed: [...removed] };
}

/* ---------- WebP ---------- */

function cleanWebp(bytes) {
  const removed = new Set();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = latin(bytes, i, 4);
    const size = view.getUint32(i + 4, true);
    const end = Math.min(i + 8 + size + (size % 2), bytes.length);
    if (type === "EXIF") {
      removed.add("EXIF");
      const data = bytes.subarray(i + 8, i + 8 + size);
      readTiff(startsWith(data, "Exif") ? data.subarray(6) : data).found.forEach((label) => removed.add(label));
    } else if (type === "XMP ") {
      removed.add("XMP");
    } else if (type === "VP8X") {
      const chunk = bytes.slice(i, end);
      chunk[8] &= ~0x0c; // clear the EXIF + XMP flags
      parts.push(chunk);
    } else {
      parts.push(bytes.subarray(i, end));
    }
    i = end;
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return { bytes: concat([header, body]), removed: [...removed] };
}

/* ---------- GIF ---------- */

function cleanGif(bytes) {
  const removed = new Set();
  const parts = [];
  const skipBlocks = (at) => {
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1;
    return at + 1;
  };
  let i = 13;
  if (bytes[10] & 0x80) i += 3 * 2 ** ((bytes[10] & 0x07) + 1);
  parts.push(bytes.subarray(0, i));

  while (i < bytes.length) {
    const start = i;
    const kind = bytes[i];
    if (kind === 0x3b) {
      parts.push(bytes.subarray(i, i + 1));
      break;
    }
    if (kind === 0x2c) {
      let at = i + 10;
      if (bytes[i + 9] & 0x80) at += 3 * 2 ** ((bytes[i + 9] & 0x07) + 1);
      i = skipBlocks(at + 1);
      parts.push(bytes.subarray(start, i));
    } else if (kind === 0x21) {
      const label = bytes[i + 1];
      i = skipBlocks(i + 2);
      if (label === 0xfe) removed.add("Comments");
      else if (label === 0xff && !/NETSCAPE|ANIMEXTS/.test(latin(bytes, start + 3, 8))) removed.add("XMP / app data");
      else parts.push(bytes.subarray(start, i));
    } else {
      throw new Error("This GIF looks damaged");
    }
  }
  return { bytes: concat(parts), removed: [...removed] };
}

/* ---------- MP4 / MOV / M4A ---------- */

function cleanMp4(input) {
  const bytes = input.slice();
  const view = new DataView(bytes.buffer);
  const removed = new Set();

  const boxes = (start, end, visit) => {
    let i = start;
    while (i + 8 <= end) {
      let size = view.getUint32(i);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(i + 8));
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < header) break;
      visit(latin(bytes, i + 4, 4), i, i + header, Math.min(i + size, end));
      i += size;
    }
  };
  const neutralise = (at, end) => {
    const box = bytes.subarray(at, end);
    if (includesText(box, "©xyz") || includesText(box, "location")) removed.add("GPS location");
    bytes.set([0x66, 0x72, 0x65, 0x65], at + 4); // rename to "free" so players skip it…
    const header = view.getUint32(at) === 1 ? 16 : 8;
    bytes.fill(0, at + header, end); // …and wipe its contents so nothing is left behind
  };
  const clearDates = (bodyStart) => {
    const size = bytes[bodyStart] === 1 ? 8 : 4;
    bytes.fill(0, bodyStart + 4, bodyStart + 4 + size * 2);
    removed.add("Recording date");
  };

  const walk = (start, end) =>
    boxes(start, end, (type, at, body, boxEnd) => {
      if (type === "udta" || type === "meta" || type === "uuid") {
        removed.add(type === "uuid" ? "XMP" : "Tags");
        neutralise(at, boxEnd);
      } else if (type === "mvhd" || type === "tkhd" || type === "mdhd") {
        clearDates(body);
      } else if (type === "moov" || type === "trak" || type === "mdia") {
        walk(body, boxEnd);
      }
    });

  boxes(0, bytes.length, (type, at, body, end) => {
    if (type === "moov") walk(body, end);
    else if (type === "udta" || type === "uuid") {
      removed.add(type === "uuid" ? "XMP" : "Tags");
      neutralise(at, end);
    }
  });
  return { bytes, removed: [...removed] };
}

/* ---------- MP3 ---------- */

function cleanMp3(bytes) {
  const removed = new Set();
  let start = 0;
  let end = bytes.length;

  while (startsWith(bytes, "ID3", start)) {
    const size = (bytes[start + 6] << 21) | (bytes[start + 7] << 14) | (bytes[start + 8] << 7) | bytes[start + 9];
    const tag = bytes.subarray(start, start + 10 + size);
    removed.add("ID3 tags");
    if (includesText(tag, "APIC") || includesText(tag, "PIC")) removed.add("Cover art");
    start += 10 + size + (bytes[start + 5] & 0x10 ? 10 : 0);
  }
  if (end - 128 >= start && startsWith(bytes, "TAG", end - 128)) {
    end -= 128;
    removed.add("ID3 tags");
    if (end - 227 >= start && startsWith(bytes, "TAG+", end - 227)) end -= 227;
  }
  if (end - 32 >= start && startsWith(bytes, "APETAGEX", end - 32)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = view.getUint32(end - 20, true);
    const hasHeader = view.getUint32(end - 12, true) & 0x80000000;
    end -= size + (hasHeader ? 32 : 0);
    removed.add("APE tags");
  }
  return { bytes: bytes.subarray(start, end), removed: [...removed] };
}

/* ---------- PDF ---------- */

async function cleanPdf(bytes) {
  const { PDFDocument, PDFName, PDFRef } = await import("pdf-lib");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test(error?.message)) throw new Error("Password-protected PDFs can't be cleaned");
    throw new Error("This PDF couldn't be opened");
  }
  const removed = new Set();
  if (doc.getAuthor()) removed.add("Author");
  if (doc.getTitle() || doc.getSubject() || doc.getKeywords()) removed.add("Title & keywords");
  if (doc.getCreator() || doc.getProducer()) removed.add("Software");
  if (doc.getCreationDate() || doc.getModificationDate()) removed.add("Dates");

  const info = doc.context.trailerInfo.Info;
  if (info) {
    if (info instanceof PDFRef) doc.context.delete(info);
    doc.context.trailerInfo.Info = undefined;
    if (!removed.size) removed.add("Document info");
  }
  const xmp = doc.catalog.get(PDFName.of("Metadata"));
  if (xmp) {
    if (xmp instanceof PDFRef) doc.context.delete(xmp);
    doc.catalog.delete(PDFName.of("Metadata"));
    removed.add("XMP");
  }
  for (const page of doc.getPages()) {
    const pageXmp = page.node.get(PDFName.of("Metadata"));
    if (pageXmp) {
      if (pageXmp instanceof PDFRef) doc.context.delete(pageXmp);
      page.node.delete(PDFName.of("Metadata"));
      removed.add("XMP");
    }
  }
  return { bytes: await doc.save({ updateFieldAppearances: false }), removed: [...removed] };
}

/* ---------- Office (docx/xlsx/pptx) and OpenDocument (odt/ods/odp) ---------- */

const EMPTY_CORE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>';
const EMPTY_APP =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
const EMPTY_CUSTOM =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
const EMPTY_ODF_META =
  '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:meta/></office:document-meta>';

const PEOPLE_PATTERNS = [
  [/(w:author|w15:author|w15:userId|w15:providerId|w:initials)="[^"]*"/g, '$1="Author"'],
  [/<author>[^<]*<\/author>/g, "<author>Author</author>"],
  [/(<p:cmAuthor\b[^>]*?\b)name="[^"]*"/g, '$1name="Author"'],
  [/(<p:cmAuthor\b[^>]*?\b)initials="[^"]*"/g, '$1initials="A"'],
];

async function cleanOfficeZip(bytes) {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("This document couldn't be opened");
  }
  const removed = new Set();
  const out = {};

  for (const [path, data] of Object.entries(entries)) {
    if (path === "mimetype") {
      out[path] = [data, { level: 0 }];
      continue;
    }
    if (path === "docProps/core.xml") {
      const xml = strFromU8(data);
      if (/<dc:creator>[^<]/.test(xml)) removed.add("Author");
      if (/<cp:lastModifiedBy>[^<]/.test(xml)) removed.add("Last edited by");
      if (/<dcterms:(created|modified)/.test(xml)) removed.add("Dates");
      if (/<dc:title>[^<]|<cp:keywords>[^<]|<dc:subject>[^<]/.test(xml)) removed.add("Title & keywords");
      out[path] = strToU8(EMPTY_CORE);
      continue;
    }
    if (path === "docProps/app.xml") {
      const xml = strFromU8(data);
      if (/<Company>[^<]/.test(xml)) removed.add("Company");
      if (/<Application>[^<]/.test(xml)) removed.add("Software");
      out[path] = strToU8(EMPTY_APP);
      continue;
    }
    if (path === "docProps/custom.xml") {
      removed.add("Custom properties");
      out[path] = strToU8(EMPTY_CUSTOM);
      continue;
    }
    if (path === "meta.xml") {
      const xml = strFromU8(data);
      if (/<(meta:initial-creator|dc:creator)>/.test(xml)) removed.add("Author");
      if (/<(meta:creation-date|dc:date)>/.test(xml)) removed.add("Dates");
      if (/<meta:generator>/.test(xml)) removed.add("Software");
      out[path] = strToU8(EMPTY_ODF_META);
      continue;
    }
    if (/^(word|xl|ppt)\/.*\.xml$/.test(path) && /comment|people|document\.xml/i.test(path)) {
      const xml = strFromU8(data);
      let cleaned = xml;
      for (const [pattern, replacement] of PEOPLE_PATTERNS) cleaned = cleaned.replace(pattern, replacement);
      if (cleaned !== xml) {
        removed.add("Comment & edit authors");
        out[path] = strToU8(cleaned);
        continue;
      }
    }
    out[path] = data;
  }
  return { bytes: zipSync(out, { level: 6 }), removed: [...removed] };
}

/* ---------- SVG ---------- */

function cleanSvg(bytes) {
  const text = new TextDecoder().decode(bytes);
  const removed = new Set();
  const cleaned = text
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, () => (removed.add("Metadata block"), ""))
    .replace(/<!--[\s\S]*?-->/g, () => (removed.add("Comments"), ""))
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, () => (removed.add("Editor data"), ""))
    .replace(/\s(?:sodipodi|inkscape):[\w-]+="[^"]*"/g, () => (removed.add("Editor data"), ""));
  return { bytes: new TextEncoder().encode(cleaned), removed: [...removed] };
}

/* ---------- Detection ---------- */

const PLAIN_TEXT = new Set(["txt", "csv", "tsv", "json", "md", "log", "xml", "yml", "yaml", "html", "css", "js"]);
const OFFICE = new Set(["docx", "xlsx", "pptx", "docm", "xlsm", "pptm", "dotx", "xltx", "potx", "odt", "ods", "odp"]);

export function detectKind(bytes, name) {
  const ext = extensionOf(name);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (startsWith(bytes, "\x89PNG")) return "png";
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WEBP", 8)) return "webp";
  if (startsWith(bytes, "GIF8")) return "gif";
  if (startsWith(bytes, "%PDF")) return "pdf";
  if (startsWith(bytes, "ftyp", 4)) {
    const brand = latin(bytes, 8, 4);
    return /hei|mif1|msf1|avif|avis/.test(brand) ? "heif" : "mp4";
  }
  if (startsWith(bytes, "ID3") || ext === "mp3") return "mp3";
  if (startsWith(bytes, "PK\x03\x04") && OFFICE.has(ext)) return "office";
  if (ext === "svg") return "svg";
  if (PLAIN_TEXT.has(ext)) return "text";
  return "unknown";
}

const CLEANERS = {
  jpeg: cleanJpeg,
  png: cleanPng,
  webp: cleanWebp,
  gif: cleanGif,
  pdf: cleanPdf,
  mp4: cleanMp4,
  mp3: cleanMp3,
  office: cleanOfficeZip,
  svg: cleanSvg,
};

export const SUPPORTED_LABEL = "JPG, PNG, WebP, GIF, SVG, PDF, Word, Excel, PowerPoint, OpenDocument, MP3, MP4, MOV, M4A";

/**
 * Cleans bytes already in memory, for the server. Returns { bytes, removed, note } and throws
 * a plain Error for types that cannot be cleaned.
 */
export async function cleanBytes(bytes, name) {
  if (!bytes.length) throw new Error("This file is empty");
  const kind = detectKind(bytes, name);
  if (kind === "heif") throw new Error("HEIC/AVIF can't be cleaned yet");
  if (kind === "text") return { bytes, removed: [], note: "Plain text has no hidden metadata" };
  if (kind === "unknown") throw new Error(`.${extensionOf(name) || "?"} files aren't supported yet`);
  const result = await CLEANERS[kind](bytes);
  return { bytes: result.bytes, removed: result.removed, note: result.removed.length ? null : "No metadata found" };
}

/** Queue processor: reads, cleans and returns a ready-to-download blob. */
export async function stripMetadata(file, onProgress, { suffix = true } = {}) {
  if (file.size === 0) throw new Error("This file is empty");
  const bytes = await readFile(file, (share) => onProgress(share * 0.6));
  onProgress(0.65);
  const kind = detectKind(bytes, file.name);
  const outName = suffix ? file.name.replace(/(\.[^.]+)?$/, (ext) => `-clean${ext}`) : file.name;

  if (kind === "heif") throw new Error("HEIC/AVIF can't be cleaned yet — convert it with Image converter");
  if (kind === "text") {
    onProgress(1);
    return { blob: file, name: outName, removed: [], note: "Plain text has no hidden metadata" };
  }
  if (kind === "unknown") throw new Error(`.${extensionOf(file.name) || "?"} files aren't supported yet`);

  const result = await CLEANERS[kind](bytes);
  onProgress(0.95);
  return {
    blob: new Blob([result.bytes], { type: file.type || "application/octet-stream" }),
    name: outName,
    removed: result.removed,
    note: result.removed.length ? null : "No metadata found",
  };
}
