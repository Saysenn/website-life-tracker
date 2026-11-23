/**
 * The Screenshotr companion extension, built in the browser as a zip to "Load unpacked".
 * It captures the tab you're on with shortcuts — the visible part, a dragged area, or the whole
 * scrolling page — and hands the pixels to the Screenshotr tab (opening it if needed) to edit.
 *
 * Bridge: background → content script (on the Screenshotr page) → window.postMessage → the page.
 * The page says "ready" when it can take captures; until then the background keeps asking.
 */

import { strToU8, zipSync } from "fflate";

export const SHOT_TAG = "__uncler_shot";
export const SHOT_PATH = "/tools/screenshotr";
export const SHOT_EXTENSION_VERSION = "1.0.0";
const WINDOW_NAME = "uncler-screenshotr";

/** A bookmark that opens Screenshotr in a small window, or brings back the one already open. */
export function shotBookmarklet(origin) {
  const url = `${origin}${SHOT_PATH}`;
  const code = `(()=>{const w=window.open('','${WINDOW_NAME}','popup,width=1100,height=860');if(!w){location.href='${url}';return}try{if(w.location.href==='about:blank')w.location.href='${url}'}catch(e){}w.focus()})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

const manifest = (origin) => ({
  manifest_version: 3,
  name: "Life Tracker Screenshotr",
  short_name: "Screenshotr",
  version: SHOT_EXTENSION_VERSION,
  description: "Screenshot the visible tab, a dragged area or the whole scrolling page, then annotate it in Screenshotr.",
  permissions: ["activeTab", "scripting"],
  host_permissions: [`${origin}/*`],
  background: { service_worker: "background.js" },
  action: { default_title: "Screenshotr", default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  content_scripts: [{ matches: [`${origin}${SHOT_PATH}*`], js: ["content.js"], run_at: "document_start" }],
  commands: {
    visible: { suggested_key: { default: "Alt+Shift+1" }, description: "Capture the visible part of the tab" },
    area: { suggested_key: { default: "Alt+Shift+2" }, description: "Capture an area you drag" },
    page: { suggested_key: { default: "Alt+Shift+3" }, description: "Capture the whole scrolling page" },
  },
});

const background = (origin) => `const PAGE = ${JSON.stringify(`${origin}${SHOT_PATH}`)};
const MAX_FRAMES = 30;
// Chrome allows two captureVisibleTab calls a second.
const CAPTURE_GAP = 560;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastCapture = 0;
let busy = false;

async function grab(windowId) {
  const wait = lastCapture + CAPTURE_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastCapture = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

async function run(tab, func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return result ? result.result : undefined;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function shotTab() {
  const tabs = await chrome.tabs.query({ url: PAGE + "*" });
  if (tabs[0]) return { tab: tabs[0], fresh: false };
  return { tab: await chrome.tabs.create({ url: PAGE, active: false }), fresh: true };
}

function flag(text, title) {
  chrome.action.setBadgeBackgroundColor({ color: "#d0472f" });
  chrome.action.setBadgeText({ text });
  chrome.action.setTitle({ title: title || "Screenshotr" });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Screenshotr" });
  }, 4000);
}

/** Sends the capture to the Screenshotr tab in pieces (big pages don't fit in one message), then shows it. */
async function deliver(messages) {
  const { tab } = await shotTab();
  let ready = false;
  for (let i = 0; i < 80 && !ready; i += 1) {
    try {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: "ping" });
      ready = Boolean(reply && reply.ok);
    } catch (error) {
      ready = false;
    }
    if (!ready) await sleep(250);
  }
  if (!ready) return flag("!", "Screenshotr didn't open — sign in there, then try again");
  for (const data of messages) await chrome.tabs.sendMessage(tab.id, { type: "deliver", data });
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// ---- Functions run inside the page being captured ----

function pageInfo() {
  const root = document.scrollingElement || document.documentElement;
  return {
    height: Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0),
    view: window.innerHeight,
    width: window.innerWidth,
    x: window.scrollX,
    y: window.scrollY,
    title: document.title,
  };
}

function scrollToY(y) {
  window.scrollTo({ top: y, left: 0, behavior: "instant" });
  return new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))), 90));
}

function hideFloating() {
  const hidden = [];
  for (const el of document.querySelectorAll("body *")) {
    const position = getComputedStyle(el).position;
    if (position === "fixed" || position === "sticky") {
      hidden.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
      el.style.setProperty("visibility", "hidden", "important");
    }
  }
  window.__unclerHidden = hidden;
  const root = document.documentElement;
  window.__unclerScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  return hidden.length;
}

function restorePage(x, y) {
  for (const [el, value, priority] of window.__unclerHidden || []) {
    if (value) el.style.setProperty("visibility", value, priority);
    else el.style.removeProperty("visibility");
  }
  window.__unclerHidden = null;
  document.documentElement.style.scrollBehavior = window.__unclerScrollBehavior || "";
  window.scrollTo({ top: y, left: x, behavior: "instant" });
}

function pickArea() {
  return new Promise((resolve) => {
    const old = document.getElementById("__uncler_area");
    if (old) old.remove();
    const root = document.createElement("div");
    root.id = "__uncler_area";
    root.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(20,16,12,.28)";
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;display:none;outline:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 0 9999px rgba(20,16,12,.28);background:transparent";
    const label = document.createElement("div");
    label.style.cssText = "position:fixed;display:none;padding:2px 6px;border-radius:5px;background:#1e1b16;color:#fffdfa;font:600 11px system-ui,sans-serif;pointer-events:none";
    const tip = document.createElement("div");
    tip.textContent = "Drag to capture an area · Esc to cancel";
    tip.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:#1e1b16;color:#fffdfa;font:600 12px system-ui,sans-serif;pointer-events:none";
    root.append(box, label, tip);
    document.documentElement.append(root);
    let start = null;
    let rect = null;
    const finish = (value) => {
      window.removeEventListener("keydown", onKey, true);
      root.remove();
      // Wait for the overlay to leave the screen before the picture is taken.
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(value), 40)));
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    root.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      root.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
      root.style.background = "transparent";
      tip.style.display = "none";
    });
    root.addEventListener("pointermove", (event) => {
      if (!start) return;
      const x = Math.min(start.x, event.clientX);
      const y = Math.min(start.y, event.clientY);
      const w = Math.abs(event.clientX - start.x);
      const h = Math.abs(event.clientY - start.y);
      rect = { x, y, w, h };
      box.style.display = "block";
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
      label.style.display = "block";
      label.textContent = Math.round(w * devicePixelRatio) + " × " + Math.round(h * devicePixelRatio);
      label.style.left = x + "px";
      label.style.top = Math.max(4, y - 24) + "px";
    });
    root.addEventListener("pointerup", () => {
      if (!rect || rect.w < 4 || rect.h < 4) {
        start = null;
        root.style.background = "rgba(20,16,12,.28)";
        box.style.display = "none";
        label.style.display = "none";
        return;
      }
      finish({ ...rect, viewWidth: window.innerWidth });
    });
  });
}

// ---- Captures ----

async function captureVisible(tab) {
  const url = await grab(tab.windowId);
  const info = await run(tab, pageInfo).catch(() => null);
  await deliver([{ kind: "visible", url, viewWidth: info ? info.width : 0, title: tab.title }]);
}

async function captureArea(tab) {
  const rect = await run(tab, pickArea);
  if (!rect) return;
  const url = await grab(tab.windowId);
  await deliver([{ kind: "area", url, rect, viewWidth: rect.viewWidth, title: tab.title }]);
}

async function capturePage(tab) {
  const info = await run(tab, pageInfo);
  const id = Date.now().toString(36);
  const frames = [];
  chrome.action.setBadgeBackgroundColor({ color: "#1e1b16" });
  try {
    const stops = [];
    for (let y = 0; y < info.height && stops.length < MAX_FRAMES; y += info.view) stops.push(y);
    for (let i = 0; i < stops.length; i += 1) {
      chrome.action.setBadgeText({ text: String(stops.length - i) });
      const at = await run(tab, scrollToY, [stops[i]]);
      // Headers and floating buttons stay in the first screen only, not repeated down the page.
      if (i === 1) await run(tab, hideFloating);
      frames.push({ url: await grab(tab.windowId), y: at });
      if (i > 0 && at === frames[i - 1].y) {
        frames.pop();
        break;
      }
    }
  } finally {
    await run(tab, restorePage, [info.x, info.y]).catch(() => {});
    chrome.action.setBadgeText({ text: "" });
  }
  const height = Math.min(info.height, frames[frames.length - 1].y + info.view);
  const messages = [{ kind: "page-start", id, total: frames.length, height, viewWidth: info.width, title: info.title, cut: info.height > height }];
  frames.forEach((frame, index) => messages.push({ kind: "page-frame", id, index, frame }));
  messages.push({ kind: "page-end", id });
  await deliver(messages);
}

async function capture(kind, tab) {
  if (busy) return;
  busy = true;
  try {
    tab = tab || (await activeTab());
    if (!tab) return;
    if (kind === "open") {
      const { tab: page } = await shotTab();
      await chrome.tabs.update(page.id, { active: true });
      await chrome.windows.update(page.windowId, { focused: true });
      return;
    }
    if (kind === "visible") await captureVisible(tab);
    if (kind === "area") await captureArea(tab);
    if (kind === "page") await capturePage(tab);
  } catch (error) {
    flag("×", "Can't capture this tab — browser pages and the Web Store are off limits");
  } finally {
    busy = false;
  }
}

chrome.commands.onCommand.addListener((command, tab) => capture(command, tab));

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "capture") capture(message.kind);
});
`;

const content = `const TAG = ${JSON.stringify(SHOT_TAG)};
let ready = false;
const hello = () => window.postMessage({ [TAG]: "extension", version: chrome.runtime.getManifest().version }, location.origin);

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === "ping") reply({ ok: ready });
  if (message?.type === "deliver") {
    window.postMessage({ [TAG]: "capture", data: message.data }, location.origin);
    reply({ ok: true });
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data[TAG] === "page-ready") {
    ready = true;
    hello();
  }
  if (data[TAG] === "page-gone") ready = false;
});

hello();
`;

const popupHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; width: 248px; padding: 8px; background: #fffdfa; color: #1e1b16; font: 13px/1.3 system-ui, -apple-system, sans-serif; }
  h1 { margin: 2px 4px 8px; font-size: 13px; font-weight: 700; }
  button { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  button:hover { background: #f1ebe2; }
  kbd { margin-left: auto; font: 600 11px system-ui, sans-serif; color: #7a7064; }
  .dot { width: 18px; height: 18px; border-radius: 5px; background: #efe6d8; display: grid; place-items: center; font-size: 11px; }
  p { margin: 8px 4px 2px; font-size: 11px; color: #7a7064; }
</style>
</head>
<body>
  <h1>Screenshotr</h1>
  <button data-kind="visible"><span class="dot">▭</span>Visible part<kbd data-key="visible"></kbd></button>
  <button data-kind="area"><span class="dot">⌗</span>Drag an area<kbd data-key="area"></kbd></button>
  <button data-kind="page"><span class="dot">↕</span>Whole page<kbd data-key="page"></kbd></button>
  <button data-kind="open"><span class="dot">↗</span>Open Screenshotr</button>
  <p>Change the keys at chrome://extensions/shortcuts</p>
  <script src="popup.js"></script>
</body>
</html>
`;

const popupJs = `for (const button of document.querySelectorAll("button[data-kind]")) {
  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "capture", kind: button.dataset.kind });
    window.close();
  });
}
chrome.commands.getAll((commands) => {
  for (const command of commands) {
    const kbd = document.querySelector('kbd[data-key="' + command.name + '"]');
    if (kbd) kbd.textContent = command.shortcut || "";
  }
});
`;

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the icon"))), "image/png"));
}

async function icon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1e1b16";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.24);
  ctx.fill();
  // Four corner marks: a selection frame.
  const m = size * 0.22;
  const l = size * 0.2;
  ctx.strokeStyle = "#fffdfa";
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [m, m, 1, 1],
    [size - m, m, -1, 1],
    [m, size - m, 1, -1],
    [size - m, size - m, -1, -1],
  ]) {
    ctx.moveTo(x, y + dy * l);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * l, y);
  }
  ctx.stroke();
  ctx.fillStyle = "#d0472f";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  return new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
}

/** The extension's files as a zip, set up for this site. */
export async function buildShotExtension(origin) {
  const dir = "life-tracker-screenshotr/";
  const files = {
    [`${dir}manifest.json`]: strToU8(JSON.stringify(manifest(origin), null, 2)),
    [`${dir}background.js`]: strToU8(background(origin)),
    [`${dir}content.js`]: strToU8(content),
    [`${dir}popup.html`]: strToU8(popupHtml),
    [`${dir}popup.js`]: strToU8(popupJs),
  };
  for (const size of [16, 32, 48, 128]) files[`${dir}icons/${size}.png`] = await icon(size);
  return new Blob([zipSync(files)], { type: "application/zip" });
}

/** For checks outside the browser: the script sources only. */
export const extensionSources = (origin) => ({ background: background(origin), content, popup: popupJs });
