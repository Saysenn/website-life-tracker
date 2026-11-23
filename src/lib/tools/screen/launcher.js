/**
 * Ways to reach the screen recorder from anywhere: a bookmarklet, and a small Chrome/Edge extension that adds a
 * toolbar button with the timer and controls, keyboard shortcuts that work in every tab, and a live badge.
 *
 * The page and the extension talk through window.postMessage, tagged with BRIDGE_TAG:
 *   page → extension  { __uncler: "state", state }   (phase, elapsed, bytes, countdown, mic, cam)
 *   page → extension  { __uncler: "page-ready" }
 *   extension → page  { __uncler: "extension", version }
 *   extension → page  { __uncler: "command", action }  (record, pause, screenshot, mic, cam, stop)
 */

import { strToU8, zipSync } from "fflate";
import { canvasBlob } from "./capture";

export const BRIDGE_TAG = "__uncler";
export const RECORDER_PATH = "/tools/screen-recorder";
export const EXTENSION_VERSION = "1.0.0";
const WINDOW_NAME = "uncler-recorder";

/** A bookmark that opens the recorder in a small window, or brings back the one already open (never reloading it). */
export function bookmarklet(origin) {
  const url = `${origin}${RECORDER_PATH}`;
  const code = `(()=>{const w=window.open('','${WINDOW_NAME}','popup,width=520,height=860');if(!w){location.href='${url}';return}try{if(w.location.href==='about:blank')w.location.href='${url}'}catch(e){}w.focus()})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

const manifest = (origin) => ({
  manifest_version: 3,
  name: "Life Tracker Recorder",
  version: EXTENSION_VERSION,
  description: "Start, pause, screenshot and stop your screen recording from any tab.",
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  action: { default_title: "Screen recorder", default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
  background: { service_worker: "background.js" },
  permissions: ["storage"],
  host_permissions: [`${origin}/*`],
  content_scripts: [{ matches: [`${origin}${RECORDER_PATH}*`], js: ["content.js"], run_at: "document_start" }],
  commands: {
    _execute_action: { suggested_key: { default: "Alt+Shift+O" }, description: "Open the recorder controls" },
    record: { suggested_key: { default: "Alt+Shift+R" }, description: "Start / stop recording" },
    pause: { suggested_key: { default: "Alt+Shift+P" }, description: "Pause / resume" },
    screenshot: { suggested_key: { default: "Alt+Shift+S" }, description: "Take a screenshot" },
    mic: { description: "Mute / unmute the microphone" },
  },
});

const background = (origin) => `const APP = ${JSON.stringify(origin + RECORDER_PATH)};
const LIVE = new Set(["recording", "paused", "countdown"]);

async function current() {
  return (await chrome.storage.session.get("rec")).rec ?? { phase: "idle" };
}

function clock(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const m = Math.floor(total / 60);
  return m >= 10 ? m + "m" : m + ":" + String(total % 60).padStart(2, "0");
}

async function save(state, tabId) {
  await chrome.storage.session.set({ rec: { ...state, tabId, at: Date.now() } });
  const live = LIVE.has(state.phase);
  chrome.action.setBadgeText({ text: !live ? "" : state.phase === "paused" ? "❚❚" : state.phase === "countdown" ? String(state.countdown || "") : clock(state.elapsed) });
  chrome.action.setBadgeBackgroundColor({ color: state.phase === "paused" ? "#97620d" : "#a63f2a" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  chrome.action.setTitle({ title: live ? (state.phase === "paused" ? "Recording paused" : "Recording " + clock(state.elapsed)) : "Screen recorder" });
}

async function recorderTab() {
  const state = await current();
  if (state.tabId != null) {
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (tab.url && tab.url.startsWith(APP)) return tab;
    } catch {}
  }
  const [tab] = await chrome.tabs.query({ url: APP + "*" });
  return tab ?? null;
}

async function focus(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function openRecorder() {
  const tab = await recorderTab();
  if (tab) return focus(tab);
  await chrome.windows.create({ url: APP, type: "popup", width: 520, height: 860 });
}

async function run(action) {
  if (action === "open") {
    await openRecorder();
    return { ok: true };
  }
  const tab = await recorderTab();
  if (!tab) {
    if (action === "record") await openRecorder();
    return { ok: false, opened: action === "record" };
  }
  const state = await current();
  // Starting shows the browser's "choose what to share" picker, which appears over the recorder's tab.
  if (action === "record" && !LIVE.has(state.phase)) await focus(tab);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "command", action });
    return { ok: true };
  } catch {
    await focus(tab);
    return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "state" && sender.tab) {
    save(message.state, sender.tab.id);
    return;
  }
  if (message?.type === "command") {
    run(message.action).then(reply, () => reply({ ok: false }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => run(command));

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await current();
  if (state.tabId === tabId) save({ phase: "idle" }, null);
});
`;

const content = `const TAG = ${JSON.stringify(BRIDGE_TAG)};
const hello = () => window.postMessage({ [TAG]: "extension", version: chrome.runtime.getManifest().version }, location.origin);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "command") window.postMessage({ [TAG]: "command", action: message.action }, location.origin);
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data[TAG] === "page-ready") hello();
  if (data[TAG] === "state") {
    try {
      chrome.runtime.sendMessage({ type: "state", state: data.state }).catch(() => {});
    } catch {}
  }
});

hello();
`;

const popupHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 300px; font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f3eee6; color: #1e1b16; }
  .card { margin: 10px; padding: 12px; border-radius: 14px; background: #fffdfa; box-shadow: 0 1px 2px rgba(60,40,20,.06), 0 2px 8px rgba(60,40,20,.05); }
  .top { display: flex; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #b8ae9f; flex: none; }
  .dot.rec { background: #a63f2a; animation: pulse 1.2s ease-in-out infinite; }
  .dot.paused { background: #97620d; }
  @keyframes pulse { 50% { opacity: .35; } }
  .time { font: 600 22px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .sub { color: #8c8274; font-size: 11px; margin-top: 3px; }
  .row { display: flex; gap: 6px; margin-top: 12px; }
  button { flex: 1; height: 36px; border: 0; border-radius: 10px; background: #f6f2eb; color: #1e1b16; font: 600 12px ui-sans-serif, system-ui, sans-serif; cursor: pointer; transition: background-color .16s cubic-bezier(.2,.9,.3,1); }
  button:hover { background: #efe9df; }
  button:disabled { opacity: .4; cursor: default; }
  button.main { height: 44px; background: #a63f2a; color: #fff; font-size: 14px; }
  button.main:hover { background: #8f3523; }
  button.main.stop { background: #1e1b16; }
  button.on { background: #f7e4dc; color: #a63f2a; }
  .keys { margin: 0 10px 10px; color: #8c8274; font-size: 11px; }
  kbd { font: 600 10px ui-sans-serif, system-ui, sans-serif; background: #fffdfa; border-radius: 4px; padding: 1px 4px; box-shadow: 0 1px 2px rgba(60,40,20,.1); }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <span id="dot" class="dot"></span>
      <div>
        <div id="time" class="time">00:00</div>
        <div id="status" class="sub">Not recording</div>
      </div>
    </div>
    <div class="row"><button id="record" class="main">● Start recording</button></div>
    <div class="row">
      <button id="pause" disabled>Pause</button>
      <button id="screenshot">Screenshot</button>
      <button id="mic" disabled>Mic</button>
    </div>
    <div class="row"><button id="open">Open recorder</button></div>
  </div>
  <p class="keys"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> record · <kbd>P</kbd> pause · <kbd>S</kbd> screenshot — in any tab. Change them at chrome://extensions/shortcuts</p>
  <script src="popup.js"></script>
</body>
</html>
`;

const popupJs = `const $ = (id) => document.getElementById(id);
const LIVE = new Set(["recording", "paused", "countdown"]);
let state = { phase: "idle" };

const pad = (n) => String(n).padStart(2, "0");
function clock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(total % 60);
}
function size(bytes) {
  if (!bytes) return "0 MB";
  return bytes > 1e9 ? (bytes / 1e9).toFixed(2) + " GB" : (bytes / 1e6).toFixed(1) + " MB";
}

function render() {
  const live = LIVE.has(state.phase);
  const elapsed = state.phase === "recording" ? (state.elapsed || 0) + (Date.now() - (state.at || Date.now())) : state.elapsed;
  $("dot").className = "dot" + (state.phase === "recording" || state.phase === "countdown" ? " rec" : state.phase === "paused" ? " paused" : "");
  $("time").textContent = state.phase === "countdown" ? "Starting " + (state.countdown || "") : clock(live ? elapsed : 0);
  $("status").textContent =
    state.phase === "recording" ? "Recording · " + size(state.bytes) :
    state.phase === "paused" ? "Paused · " + size(state.bytes) :
    state.phase === "acquiring" ? "Choose what to share…" :
    state.phase === "selecting" ? "Pick the area in the recorder" :
    state.phase === "saving" ? "Saving…" :
    state.tabId != null ? "Ready" : "Recorder isn't open";
  const record = $("record");
  record.textContent = live ? "■ Stop and save" : "● Start recording";
  record.className = "main" + (live ? " stop" : "");
  record.disabled = state.phase === "saving" || state.phase === "acquiring";
  $("pause").disabled = state.phase !== "recording" && state.phase !== "paused";
  $("pause").textContent = state.phase === "paused" ? "Resume" : "Pause";
  $("mic").disabled = state.tabId == null || state.mic == null;
  $("mic").textContent = state.mic === false ? "Mic off" : "Mic on";
  $("mic").className = state.mic === false ? "on" : "";
}

const send = (action) => chrome.runtime.sendMessage({ type: "command", action });
$("record").onclick = () => send("record");
$("pause").onclick = () => send("pause");
$("screenshot").onclick = () => send("screenshot");
$("mic").onclick = () => send("mic");
$("open").onclick = () => send("open").then(() => window.close());

chrome.storage.session.get("rec").then(({ rec }) => {
  if (rec) state = rec;
  render();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.rec) {
    state = changes.rec.newValue ?? { phase: "idle" };
    render();
  }
});
setInterval(render, 250);
`;

async function icon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1e1b16";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.24);
  ctx.fill();
  ctx.fillStyle = "#fffdfa";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d0472f";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  return new Uint8Array(await (await canvasBlob(canvas, "image/png")).arrayBuffer());
}

/** Builds the extension for this site as a zip, ready for "Load unpacked". */
export async function buildExtension(origin) {
  const dir = "life-tracker-recorder/";
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
