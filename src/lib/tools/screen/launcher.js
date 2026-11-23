/**
 * Ways to reach the screen recorder from anywhere: a bookmarklet, and a small Chrome/Edge extension that adds a
 * toolbar button with the timer and controls, keyboard shortcuts that work in every tab, and a live badge.
 *
 * The page and the extension talk through window.postMessage, tagged with BRIDGE_TAG:
 *   page → extension  { __uncler: "state", state }   (phase, elapsed, bytes, countdown, mic, cam)
 *   page → extension  { __uncler: "page-ready" }
 *   extension → page  { __uncler: "extension", version }
 *   extension → page  { __uncler: "command", action }  (record, pause, mic, cam, stop, zoomout)
 *   extension → page  { __uncler: "input", event }     (tutorial mode: click / caret / move / key from any tab)
 *
 * In every other tab a helper script (helper.js) reports clicks, the typing caret and shortcuts while a tutorial
 * recording runs, and lets you draw right on the page (Alt+Shift+D).
 */

import { strToU8, zipSync } from "fflate";
import { canvasBlob } from "./capture";

export const BRIDGE_TAG = "__uncler";
export const RECORDER_PATH = "/tools/screen-recorder";
export const EXTENSION_VERSION = "1.1.0";
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
  description: "Control your screen recording from any tab, zoom where you click and draw on pages for tutorials.",
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  action: { default_title: "Screen recorder", default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
  background: { service_worker: "background.js" },
  permissions: ["storage"],
  // Every site, so tutorial mode can follow clicks and typing in whatever tab you're showing.
  host_permissions: ["<all_urls>"],
  content_scripts: [
    { matches: [`${origin}${RECORDER_PATH}*`], js: ["content.js"], run_at: "document_start" },
    { matches: ["<all_urls>"], exclude_matches: [`${origin}${RECORDER_PATH}*`], js: ["helper.js"], run_at: "document_idle" },
  ],
  commands: {
    _execute_action: { suggested_key: { default: "Alt+Shift+O" }, description: "Open the recorder controls" },
    record: { suggested_key: { default: "Alt+Shift+R" }, description: "Start / stop recording" },
    pause: { suggested_key: { default: "Alt+Shift+P" }, description: "Pause / resume" },
    draw: { suggested_key: { default: "Alt+Shift+D" }, description: "Draw on the page (tutorials)" },
    mic: { description: "Mute / unmute the microphone" },
    zoomout: { description: "Zoom the recording back out (tutorial mode)" },
  },
});

const background = (origin) => `const APP = ${JSON.stringify(origin + RECORDER_PATH)};
const LIVE = new Set(["recording", "paused", "countdown"]);

// The helper in every tab reads the recorder's state (is a tutorial recording running, which ink) from here.
chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {});

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

async function drawOnPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || (tab.url && tab.url.startsWith(APP))) return { ok: false };
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "draw" });
    return { ok: true };
  } catch {
    // Pages opened before the extension was installed (and browser pages like chrome://) don't have the helper.
    return { ok: false };
  }
}

async function forward(event) {
  const state = await current();
  if (state.tabId == null || !state.tutorial) return;
  chrome.tabs.sendMessage(state.tabId, { type: "input", event }).catch(() => {});
}

async function run(action) {
  if (action === "draw") return drawOnPage();
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
  if (message?.type === "input" && sender.tab) {
    forward(message.event);
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
  if (message?.type === "input") window.postMessage({ [TAG]: "input", event: message.event }, location.origin);
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

// Runs in every other tab. String.raw keeps the regexes' backslashes as written.
const helper = (origin) => `const ORIGIN = ${JSON.stringify(origin)};\n` + String.raw`const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const TOP = window.top === window;
let rec = { phase: "idle" };

chrome.storage.session.get("rec").then(({ rec: state }) => { if (state) rec = state; }).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.rec) rec = changes.rec.newValue || { phase: "idle" };
});

// A shared tab tells the recorder which tab it is through its capture handle, so clicks in other tabs are ignored.
const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
try {
  if (TOP) navigator.mediaDevices?.setCaptureHandleConfig?.({ handle: token, exposeOrigin: false, permittedOrigins: [ORIGIN] });
} catch {}

const tracking = () => TOP && rec.tutorial && rec.phase === "recording";

function send(event) {
  const message = {
    ...event,
    handle: token,
    focused: document.hasFocus(),
    iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight,
    sx: screenX, sy: screenY, sw: screen.width, sh: screen.height,
    sl: screen.left ?? screen.availLeft ?? 0, st: screen.top ?? 0,
  };
  try {
    chrome.runtime.sendMessage({ type: "input", event: message }).catch(() => {});
  } catch {}
}

const onBoard = (event) => board && event.composedPath().includes(board.host);

addEventListener("pointerdown", (event) => {
  if (!tracking() || !event.isPrimary || event.button !== 0 || onBoard(event)) return;
  send({ type: "click", x: event.clientX, y: event.clientY });
}, true);

let lastMove = 0;
addEventListener("pointermove", (event) => {
  if (!tracking() || !rec.lens) return;
  const now = performance.now();
  if (now - lastMove < 33) return;
  lastMove = now;
  send({ type: "move", x: event.clientX, y: event.clientY });
}, { capture: true, passive: true });

// ---- Shortcut badge: only combinations and a few named keys, never plain typing ----
const NAMES = { " ": "Space", Enter: "Return", Escape: "Esc", Tab: "Tab", Backspace: "⌫", Delete: "Del", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
function label(event) {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"].includes(event.key)) return null;
  const combo = event.metaKey || event.ctrlKey || event.altKey;
  if (!combo && !["Enter", "Escape", "Tab"].includes(event.key)) return null;
  let key = NAMES[event.key];
  if (!key) {
    if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
    else if (/^Digit\d$/.test(event.code)) key = event.code.slice(5);
    else if (/^F\d+$/.test(event.key)) key = event.key;
    else key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  }
  const parts = MAC
    ? [event.ctrlKey && "⌃", event.altKey && "⌥", event.shiftKey && "⇧", event.metaKey && "⌘"]
    : [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"];
  return parts.filter(Boolean).concat(key).join(MAC ? " " : " + ");
}

// ---- Where the text cursor is, so the zoom can follow typing ----
const editable = (el) => el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|email|url|tel|password|number|)$/.test(el.type)));
let measure;
function caretOf(el) {
  if (el.isContentEditable) {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (rect && (rect.height || rect.left)) return { x: rect.left, y: rect.top + rect.height / 2 };
    const box = el.getBoundingClientRect();
    return { x: box.left + 8, y: box.top + 12 };
  }
  const box = el.getBoundingClientRect();
  const css = getComputedStyle(el);
  const at = el.selectionEnd ?? el.value.length;
  if (el.tagName === "INPUT") {
    measure ??= document.createElement("canvas").getContext("2d");
    measure.font = css.font;
    const text = el.type === "password" ? "•".repeat(at) : el.value.slice(0, at);
    const x = box.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft) + measure.measureText(text).width - el.scrollLeft;
    return { x: Math.min(box.right - 4, x), y: box.top + box.height / 2 };
  }
  // Textarea: lay the text out in an invisible copy and see where the end lands.
  const mirror = document.createElement("div");
  for (const prop of ["font", "letterSpacing", "lineHeight", "padding", "border", "boxSizing", "whiteSpace", "wordWrap", "wordBreak", "tabSize", "textIndent"]) mirror.style[prop] = css[prop];
  Object.assign(mirror.style, { position: "fixed", visibility: "hidden", left: "0", top: "0", width: box.width + "px", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  mirror.textContent = el.value.slice(0, at);
  const mark = document.createElement("span");
  mark.textContent = "​";
  mirror.append(mark);
  document.documentElement.append(mirror);
  const x = box.left + mark.offsetLeft - el.scrollLeft;
  const y = box.top + mark.offsetTop - el.scrollTop + mark.offsetHeight / 2;
  mirror.remove();
  return { x: Math.min(box.right - 4, Math.max(box.left, x)), y: Math.min(box.bottom - 4, Math.max(box.top, y)) };
}

let caretTimer = 0;
function reportCaret() {
  if (caretTimer) return;
  caretTimer = setTimeout(() => {
    caretTimer = 0;
    const el = document.activeElement;
    if (!tracking() || !editable(el)) return;
    try {
      const at = caretOf(el);
      if (at) send({ type: "caret", x: at.x, y: at.y });
    } catch {}
  }, 120);
}

addEventListener("keydown", (event) => {
  if (board && boardKey(event)) return;
  if (!tracking()) return;
  const text = label(event);
  if (text) send({ type: "key", label: text });
  if (editable(event.composedPath()[0]) || editable(document.activeElement)) reportCaret();
}, true);
addEventListener("input", () => tracking() && reportCaret(), true);

// ---- Drawing on the page ----
let board = null;
const WIDTHS = { s: 3, m: 5, l: 9 };
const INKS = ["#e0453a", "#f2c94c", "#4f8a3c", "#2f6fd6", "#ffffff", "#1e1b16"];

function openBoard() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}canvas{position:fixed;inset:0;cursor:crosshair;touch-action:none}' +
    '.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:4px;align-items:center;padding:6px;border-radius:14px;background:rgba(255,253,250,.96);box-shadow:0 2px 12px rgba(40,25,10,.22);font:600 12px ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1e1b16}' +
    'button{all:unset;box-sizing:border-box;height:30px;min-width:30px;padding:0 9px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#f3eee6}' +
    'button:hover{background:#ebe4d8}button.on{background:#1e1b16;color:#fffdfa}' +
    '.ink{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}button.dot{min-width:26px;padding:0;background:transparent}button.dot.on{background:#ebe4d8}' +
    '.sep{width:1px;height:18px;background:#e4dccf;margin:0 2px}.done{background:#a63f2a;color:#fff}.done:hover{background:#8f3523}' +
    '</style><canvas></canvas><div class="bar"></div>';
  const canvas = root.querySelector("canvas");
  const bar = root.querySelector(".bar");
  const ctx = canvas.getContext("2d");
  const state = { tool: "pen", ink: rec.ink || INKS[0], strokes: [], current: null };
  const tools = [["pen", "Pen", "1"], ["marker", "Highlight", "2"], ["arrow", "Arrow", "3"], ["box", "Box", "4"]];

  function size() {
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }
  function stroke(s) {
    const w = WIDTHS[rec.inkWidth] || WIDTHS.m;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = s.ink;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = w;
    if (s.tool === "pen" || s.tool === "marker") {
      if (s.tool === "marker") { ctx.globalAlpha = 0.38; ctx.lineWidth = w * 5; ctx.lineCap = "square"; }
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
      ctx.stroke();
    } else if (s.tool === "box") {
      ctx.beginPath();
      ctx.roundRect(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y), 6);
      ctx.stroke();
    } else {
      const angle = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
      const head = Math.max(w * 4, 14);
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x - Math.cos(angle) * head * 0.6, s.b.y - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.b.x, s.b.y);
      ctx.lineTo(s.b.x - head * Math.cos(angle - 0.45), s.b.y - head * Math.sin(angle - 0.45));
      ctx.lineTo(s.b.x - head * Math.cos(angle + 0.45), s.b.y - head * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  function paint() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    state.strokes.forEach(stroke);
  }
  function button(text, title, onClick, cls) {
    const b = document.createElement("button");
    b.textContent = text;
    b.title = title;
    if (cls) b.className = cls;
    b.onclick = onClick;
    bar.append(b);
    return b;
  }
  function render() {
    bar.textContent = "";
    for (const [tool, name, key] of tools) button(name, name + " (" + key + ")", () => { state.tool = tool; render(); }, state.tool === tool ? "on" : "");
    const sep = document.createElement("span");
    sep.className = "sep";
    bar.append(sep);
    for (const ink of INKS) {
      const b = button("", "Ink", () => { state.ink = ink; render(); }, "dot" + (state.ink === ink ? " on" : ""));
      const dot = document.createElement("span");
      dot.className = "ink";
      dot.style.background = ink;
      b.append(dot);
    }
    bar.append(sep.cloneNode());
    button("Undo", "Undo (U)", () => { state.strokes.pop(); paint(); });
    button("Clear", "Clear (C)", () => { state.strokes = []; paint(); });
    button("Done", "Stop drawing (Esc)", closeBoard, "done");
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const p = { x: event.clientX, y: event.clientY };
    state.current = { tool: state.tool, ink: state.ink, points: [p], a: p, b: p };
    state.strokes.push(state.current);
    paint();
  });
  canvas.addEventListener("pointermove", (event) => {
    const s = state.current;
    if (!s) return;
    const p = { x: event.clientX, y: event.clientY };
    if (s.tool === "pen" || s.tool === "marker") s.points.push(p);
    else s.b = p;
    paint();
  });
  const end = () => { state.current = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  addEventListener("resize", size);

  board = { host, state, render, paint, size };
  document.documentElement.append(host);
  render();
  size();
}

function closeBoard() {
  if (!board) return;
  removeEventListener("resize", board.size);
  board.host.remove();
  board = null;
}

function boardKey(event) {
  const key = event.key;
  let handled = true;
  if (key === "Escape") closeBoard();
  else if (["1", "2", "3", "4"].includes(key)) { board.state.tool = ["pen", "marker", "arrow", "box"][Number(key) - 1]; board.render(); }
  else if (key === "u" || key === "U" || ((event.metaKey || event.ctrlKey) && key === "z")) { board.state.strokes.pop(); board.paint(); }
  else if (key === "c" || key === "C") { board.state.strokes = []; board.paint(); }
  else handled = false;
  if (handled) { event.preventDefault(); event.stopPropagation(); }
  return handled;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "draw" && TOP) board ? closeBoard() : openBoard();
});
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
      <button id="draw" title="Draw on this page">Draw</button>
      <button id="mic" disabled>Mic</button>
    </div>
    <div class="row"><button id="open">Open recorder</button></div>
  </div>
  <p class="keys"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> record · <kbd>P</kbd> pause · <kbd>D</kbd> draw on the page — in any tab. Change them at chrome://extensions/shortcuts</p>
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
$("draw").onclick = () => send("draw").then(() => window.close());
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
    [`${dir}helper.js`]: strToU8(helper(origin)),
    [`${dir}popup.html`]: strToU8(popupHtml),
    [`${dir}popup.js`]: strToU8(popupJs),
  };
  for (const size of [16, 32, 48, 128]) files[`${dir}icons/${size}.png`] = await icon(size);
  return new Blob([zipSync(files)], { type: "application/zip" });
}
