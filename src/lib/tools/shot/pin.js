/**
 * Pins: screenshots floating above every other window, using the browser's always-on-top
 * picture-in-picture window. A page can have only one such window, so pins form a stack inside it
 * — ← → (or the arrows on hover) switch between them, Esc unpins the one showing.
 * Without Document PiP (Firefox, Safari) a pin opens in a small ordinary window instead.
 */

const pins = [];
let index = 0;
let win = null;
let winKind = "top";
let zoom = 1;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(pins.length));

export function subscribePins(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const pinCount = () => pins.length;
export const canPinOnTop = () => typeof window !== "undefined" && "documentPictureInPicture" in window;

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#1e1b16;overflow:hidden;font:600 12px ui-sans-serif,system-ui,-apple-system,sans-serif;color:#fffdfa;user-select:none}
#stage{position:absolute;inset:0;overflow:auto;display:grid;place-items:center}
#stage.fit img{max-width:100vw;max-height:100vh}
img{display:block;image-rendering:auto;transform-origin:center}
#bar{position:fixed;left:6px;right:6px;bottom:6px;display:flex;gap:4px;align-items:center;padding:4px;border-radius:10px;background:rgba(30,27,22,.82);backdrop-filter:blur(8px);opacity:0;transition:opacity .15s}
body:hover #bar,#bar:focus-within{opacity:1}
button{all:unset;cursor:pointer;height:26px;min-width:26px;padding:0 7px;border-radius:7px;display:grid;place-items:center;color:#fffdfa}
button:hover{background:rgba(255,253,250,.16)}
button:disabled{opacity:.35;cursor:default}
#count{flex:1;text-align:center;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#toast{position:fixed;top:8px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:8px;background:rgba(30,27,22,.85);opacity:0;transition:opacity .15s;pointer-events:none}
`;

function windowSize(pin) {
  const max = Math.min(640, Math.round(screen.availWidth * 0.4));
  const w = Math.max(220, Math.min(max, pin.width));
  const h = Math.max(120, Math.round((w / pin.width) * pin.height));
  return { width: w, height: Math.min(h, Math.round(screen.availHeight * 0.8)) };
}

function flash(text) {
  const toast = win?.document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.style.opacity = "1";
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (toast.style.opacity = "0"), 900);
}

function render() {
  if (!win || win.closed) return;
  const doc = win.document;
  const pin = pins[index];
  if (!pin) {
    win.close();
    return;
  }
  const img = doc.querySelector("img");
  if (img.src !== pin.url) img.src = pin.url;
  img.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
  doc.getElementById("stage").className = zoom === 1 ? "fit" : "";
  doc.getElementById("count").textContent = pins.length > 1 ? `${index + 1} / ${pins.length}` : pin.name;
  doc.getElementById("prev").disabled = pins.length < 2;
  doc.getElementById("next").disabled = pins.length < 2;
  doc.title = `Pinned — ${pin.name}`;
}

function show(next) {
  index = (next + pins.length) % pins.length;
  zoom = 1;
  render();
  try {
    const size = windowSize(pins[index]);
    win.resizeTo(size.width, size.height);
  } catch {
    // Resizing needs a click in the pin window; a key press elsewhere just keeps the size.
  }
}

function unpin(at = index) {
  const [gone] = pins.splice(at, 1);
  if (gone) setTimeout(() => URL.revokeObjectURL(gone.url), 1000);
  if (index >= pins.length) index = Math.max(0, pins.length - 1);
  notify();
  if (!pins.length) win?.close();
  else show(index);
}

async function copyCurrent() {
  const pin = pins[index];
  try {
    await win.navigator.clipboard.write([new win.ClipboardItem({ [pin.blob.type]: pin.blob })]);
    flash("Copied");
  } catch {
    flash("Couldn't copy");
  }
}

function build(target) {
  const doc = target.document;
  const style = doc.createElement("style");
  style.textContent = STYLE;
  doc.head.append(style);
  doc.body.innerHTML = `
    <div id="stage" class="fit"><img alt="Pinned screenshot" draggable="false"></div>
    <div id="toast"></div>
    <div id="bar">
      <button id="prev" title="Previous pin (←)">‹</button>
      <span id="count"></span>
      <button id="next" title="Next pin (→)">›</button>
      <button id="zoomout" title="Zoom out (−)">−</button>
      <button id="fit" title="Fit (0)">Fit</button>
      <button id="zoomin" title="Zoom in (+)">+</button>
      <button id="copy" title="Copy (⌘C)">Copy</button>
      <button id="close" title="Unpin (Esc)">✕</button>
    </div>`;
  const setZoom = (value) => {
    zoom = Math.max(0.25, Math.min(8, value));
    render();
    flash(`${Math.round(zoom * 100)}%`);
  };
  doc.getElementById("prev").onclick = () => show(index - 1);
  doc.getElementById("next").onclick = () => show(index + 1);
  doc.getElementById("zoomin").onclick = () => setZoom(zoom * 1.25);
  doc.getElementById("zoomout").onclick = () => setZoom(zoom / 1.25);
  doc.getElementById("fit").onclick = () => setZoom(1);
  doc.getElementById("copy").onclick = copyCurrent;
  doc.getElementById("close").onclick = () => unpin();
  doc.getElementById("stage").addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false },
  );
  doc.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") unpin();
    else if (event.key === "ArrowLeft") show(index - 1);
    else if (event.key === "ArrowRight") show(index + 1);
    else if (event.key === "+" || event.key === "=") setZoom(zoom * 1.25);
    else if (event.key === "-") setZoom(zoom / 1.25);
    else if (event.key === "0") setZoom(1);
    else if (mod && event.key.toLowerCase() === "c") copyCurrent();
    else if (mod && event.key.toLowerCase() === "w") {
      event.preventDefault();
      target.close();
    } else return;
    event.preventDefault();
  });
  target.addEventListener("pagehide", () => {
    if (win === target) win = null;
    // Closing the window unpins everything in it.
    pins.splice(0).forEach((pin) => URL.revokeObjectURL(pin.url));
    index = 0;
    notify();
  });
}

/**
 * Pins a picture. Opening the floating window needs a click or key press, so call this straight
 * from one. Returns "top" (always on top), "window" (an ordinary window) or null when blocked.
 */
export async function pinImage(blob, { width, height, name = "Screenshot" }) {
  const pin = { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), width, height, name };
  if (win && !win.closed) {
    pins.push(pin);
    notify();
    show(pins.length - 1);
    win.focus?.();
    return winKind;
  }
  const size = windowSize(pin);
  let target = null;
  let kind = "top";
  if (canPinOnTop()) {
    try {
      target = await window.documentPictureInPicture.requestWindow({ ...size, disallowReturnToOpener: true });
    } catch {
      target = null;
    }
  }
  if (!target) {
    kind = "window";
    target = window.open("", "uncler-pin", `popup,width=${size.width},height=${size.height}`);
    if (!target) {
      URL.revokeObjectURL(pin.url);
      return null;
    }
    target.document.body.innerHTML = "";
    target.document.head.innerHTML = "";
  }
  win = target;
  winKind = kind;
  pins.push(pin);
  index = pins.length - 1;
  zoom = 1;
  build(target);
  notify();
  render();
  return kind;
}

/** Closes the pin window and every pin in it. */
export function unpinAll() {
  win?.close();
}
