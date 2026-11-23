/**
 * Where a tool's finished files go. Each tool keeps its own choice:
 *   "folder"    — written straight into a folder you picked (Chrome / Edge; remembered between visits)
 *   "downloads" — sent to the browser's Downloads folder
 *   "browser"   — only kept in the tool's list in this browser
 * Every file is also listed in the tool's history either way.
 */

import { downloadBlob } from "@/lib/tools/files";
import { getSetting, setSetting } from "@/lib/tools/media-store";

export const SAVE_TARGETS = ["folder", "downloads", "browser"];

export const canPickFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

const key = (tool) => `${tool}:folder`;

/** The remembered folder for a tool, and whether we may still write to it without asking. */
export async function loadFolder(tool) {
  const handle = await getSetting(key(tool)).catch(() => null);
  if (!handle) return { handle: null, permission: null };
  const permission = await handle.queryPermission?.({ mode: "readwrite" }).catch(() => "prompt");
  return { handle, permission: permission ?? "prompt" };
}

/** Asks for a folder (must run from a click). Returns the new folder state, or null when cancelled. */
export async function pickFolder(tool, startIn = "documents") {
  const handle = await window.showDirectoryPicker({ id: `uncler-${tool}`, mode: "readwrite", startIn });
  await setSetting(key(tool), handle);
  return { handle, permission: "granted" };
}

/** Asks again for access to the remembered folder (must run from a click). */
export async function allowFolder(folder) {
  const permission = await folder.handle?.requestPermission?.({ mode: "readwrite" }).catch(() => "denied");
  return { ...folder, permission: permission ?? "denied" };
}

export function forgetFolder(tool) {
  return setSetting(key(tool), undefined).catch(() => {});
}

/** "name.png", or "name (2).png" when that's taken, so nothing in the folder is ever overwritten. */
export async function freeName(dir, name) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }
  return `${stem} ${Date.now()}${ext}`;
}

/** Writes a file into the folder. Returns its handle, or null without access. */
export async function writeToFolder(folder, name, blob) {
  if (!folder?.handle || folder.permission !== "granted") return null;
  try {
    const handle = await folder.handle.getFileHandle(await freeName(folder.handle, name), { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle;
  } catch {
    return null;
  }
}

/**
 * Puts a finished file where the tool is set to save. Returns
 * { where: "folder" | "downloads" | "browser", handle? } — falling back to Downloads when the folder can't be used.
 */
export async function deliver({ saveTo, folder, name, blob }) {
  if (saveTo === "folder") {
    const handle = await writeToFolder(folder, name, blob);
    if (handle) return { where: "folder", handle, name: handle.name };
    downloadBlob(blob, name);
    return { where: "downloads", fallback: true };
  }
  if (saveTo === "downloads") {
    downloadBlob(blob, name);
    return { where: "downloads" };
  }
  return { where: "browser" };
}

/** A short "Saved to …" line for toasts. */
export function savedWhere(result, folder) {
  if (result.where === "folder") return `in “${folder?.handle?.name}”`;
  if (result.where === "downloads") return result.fallback ? "to Downloads — allow the folder again to save there" : "to Downloads";
  return "in this browser";
}
