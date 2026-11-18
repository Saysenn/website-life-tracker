/** Builds the manhwa reader bookmarklet and browser extension from one toolbar script. */

export const READER_SCRIPT_URL = "/reader/manhwa-reader.js";
/** The version written at the top of the toolbar script; Chrome only notices updates when it changes. */
export function readerVersion(source) {
  return (source && source.match(/const VERSION = "([\d.]+)"/)?.[1]) || "1.0.0";
}

export const SPEED_PRESETS = [
  { label: "Slow", value: 30 },
  { label: "Read", value: 60 },
  { label: "Skim", value: 120 },
  { label: "Fast", value: 240 },
];

export const READER_DEFAULTS = { speed: 60, position: "bottom", autoNext: true, nextBy: "auto", nextDelay: 4, holdPause: true, fade: true };

let sourcePromise;

export function loadReaderSource() {
  sourcePromise ??= fetch(READER_SCRIPT_URL, { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("Couldn't load the reader script");
    return response.text();
  });
  sourcePromise.catch(() => (sourcePromise = undefined));
  return sourcePromise;
}

/** The toolbar script with the chosen starting settings baked in. */
export function wrapSource(source, defaults) {
  return `(() => {\nconst MR_DEFAULTS = ${JSON.stringify(defaults)};\n${source}\n})();\n`;
}

export function buildBookmarklet(source, defaults) {
  // Indentation only costs space once every character is URL encoded.
  const compact = wrapSource(source, defaults).replace(/^[ \t]+/gm, "");
  return `javascript:${encodeURIComponent(compact)}void 0`;
}

const BACKGROUND = `// Toolbar button and Alt+Shift+R show or hide the reader on the current tab.
async function toggle(tab) {
  if (!tab || tab.id == null) return;
  const message = { type: "manhwa-reader:toggle" };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Tabs opened before the extension was installed have no reader yet.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["reader.js"] });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Browser pages such as chrome:// and the web store can't be scripted.
    }
  }
}

chrome.action.onClicked.addListener(toggle);
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-reader") return;
  toggle(tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
});
`;

function manifest(version) {
  const icons = { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" };
  return {
    manifest_version: 3,
    name: "Manhwa Reader",
    version,
    description: "Hands-free auto-scroll for manhwa, webtoons and any long page. Set the speed and read without touching the mouse.",
    icons,
    action: { default_title: "Manhwa Reader (Alt+Shift+R)", default_icon: icons },
    background: { service_worker: "background.js" },
    permissions: ["storage", "scripting", "activeTab"],
    host_permissions: ["<all_urls>"],
    content_scripts: [{ matches: ["<all_urls>"], js: ["reader.js"], run_at: "document_idle" }],
    commands: {
      "toggle-reader": {
        suggested_key: { default: "Alt+Shift+R" },
        description: "Show or hide the reader toolbar",
      },
    },
  };
}

/** The app icon: a scroll strip with a down arrow, drawn on the warm ink tile. */
async function drawIcon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const s = size / 128;
  ctx.fillStyle = "#1e1b16";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 28 * s);
  ctx.fill();
  ctx.fillStyle = "#f3eee6";
  ctx.beginPath();
  ctx.roundRect(34 * s, 18 * s, 44 * s, 26 * s, 6 * s);
  ctx.roundRect(34 * s, 50 * s, 44 * s, 26 * s, 6 * s);
  ctx.fill();
  ctx.strokeStyle = "#e3b46a";
  ctx.lineWidth = Math.max(2, 10 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(56 * s, 84 * s);
  ctx.lineTo(56 * s, 108 * s);
  ctx.moveTo(42 * s, 96 * s);
  ctx.lineTo(56 * s, 110 * s);
  ctx.lineTo(70 * s, 96 * s);
  ctx.stroke();
  ctx.fillStyle = "#b8ae9f";
  ctx.beginPath();
  ctx.roundRect(88 * s, 18 * s, 8 * s, 92 * s, 4 * s);
  ctx.fill();
  ctx.fillStyle = "#e3b46a";
  ctx.beginPath();
  ctx.roundRect(88 * s, 18 * s, 8 * s, 40 * s, 4 * s);
  ctx.fill();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

const README = `Manhwa Reader
=============

Install (Chrome, Edge, Brave, Arc, Opera)
1. Unzip this folder somewhere it can stay, for example Documents/manhwa-reader.
2. Open chrome://extensions (edge://extensions in Edge).
3. Turn on Developer mode (top right).
4. Click "Load unpacked" and pick the unzipped folder.
5. Pin it from the puzzle icon in the toolbar.

Use
- Open a chapter, then click the icon or press Alt+Shift+R.
- Space play / pause, + and - change the speed, N next chapter, H shrink, Esc pause.
- Press and hold anywhere on the page to pause for a moment.
- The speed is remembered for each site. At the end of a chapter it can open the next one and keep going.

Update
Your copy never updates itself. The version shows at the bottom of the
toolbar's settings. Download a new copy from the tool page, replace the files in the same folder,
then click the reload arrow on the extension's card in chrome://extensions.
`;

export async function buildExtensionZip(source, defaults) {
  const { zipSync, strToU8 } = await import("fflate");
  const [i16, i32, i48, i128] = await Promise.all([16, 32, 48, 128].map(drawIcon));
  const files = {
    "manhwa-reader/manifest.json": strToU8(JSON.stringify(manifest(readerVersion(source)), null, 2)),
    "manhwa-reader/background.js": strToU8(BACKGROUND),
    "manhwa-reader/reader.js": strToU8(wrapSource(source, defaults)),
    "manhwa-reader/README.txt": strToU8(README),
    "manhwa-reader/icons/16.png": i16,
    "manhwa-reader/icons/32.png": i32,
    "manhwa-reader/icons/48.png": i48,
    "manhwa-reader/icons/128.png": i128,
  };
  return new Blob([zipSync(files)], { type: "application/zip" });
}
