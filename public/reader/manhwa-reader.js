/*
 * Manhwa reader: a floating auto-scroll toolbar for long strip comics.
 * One source runs three ways: as a bookmarklet, as the browser extension's
 * content script, and on the tool page's preview. The wrapper may define
 * MR_DEFAULTS with the starting settings picked on the tool page.
 */
(() => {
  "use strict";

  const KEY = "manhwa-reader";
  const EXT = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
  const DEFAULTS = typeof MR_DEFAULTS !== "undefined" && MR_DEFAULTS ? MR_DEFAULTS : {};
  const MIN_SPEED = 5;
  const MAX_SPEED = 600;
  const PRESETS = [
    ["Slow", 30],
    ["Read", 60],
    ["Skim", 120],
    ["Fast", 240],
  ];

  if (window.__manhwaReader) {
    if (!EXT) window.__manhwaReader.toggle();
    return;
  }

  /* ---------- storage: chrome.storage in the extension, the site's localStorage otherwise ---------- */

  const store = {
    load() {
      if (EXT) return new Promise((resolve) => chrome.storage.local.get(KEY, (out) => resolve((out && out[KEY]) || {})));
      try {
        return Promise.resolve(JSON.parse(localStorage.getItem(KEY)) || {});
      } catch {
        return Promise.resolve({});
      }
    },
    save(data) {
      if (EXT) return chrome.storage.local.set({ [KEY]: data });
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* storage blocked on this site: settings last until the tab closes */
      }
    },
  };

  const host = location.host || "local";
  const clampSpeed = (value) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(Number(value) || 60)));
  const pick = (source) => {
    const out = {};
    if (!source) return out;
    if (source.speed != null) out.speed = clampSpeed(source.speed);
    if (source.position === "top" || source.position === "bottom") out.position = source.position;
    for (const key of ["autoNext", "holdPause", "fade"]) if (typeof source[key] === "boolean") out[key] = source[key];
    if (source.nextDelay != null) out.nextDelay = Math.min(30, Math.max(0, Math.round(Number(source.nextDelay) || 0)));
    return out;
  };

  let data = {};
  const settings = { speed: 60, position: "bottom", autoNext: true, nextDelay: 4, holdPause: true, fade: true, ...pick(DEFAULTS) };

  let saveTimer = 0;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { speed, ...rest } = settings;
      data = { ...data, settings: rest, sites: { ...(data.sites || {}), [host]: speed } };
      store.save(data);
    }, 300);
  };

  /* ---------- finding what scrolls ---------- */

  const rootEl = () => document.scrollingElement || document.documentElement;
  const scrollable = (value) => value === "auto" || value === "scroll" || value === "overlay";
  let hostEl = null;

  function rootCanScroll() {
    const root = rootEl();
    if (root.scrollHeight - window.innerHeight < 40) return false;
    const html = getComputedStyle(document.documentElement).overflowY;
    const body = document.body ? getComputedStyle(document.body).overflowY : "visible";
    return (html !== "visible" ? html : body) !== "hidden";
  }

  function findScroller() {
    if (rootCanScroll()) return rootEl();
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (el === hostEl || el.clientHeight < 160 || el.scrollHeight - el.clientHeight < 40) continue;
      if (!scrollable(getComputedStyle(el).overflowY)) continue;
      const area = el.clientWidth * el.clientHeight;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best || rootEl();
  }

  let scroller = null;
  const isRoot = () => scroller === rootEl();
  const position = () => scroller.scrollTop;
  const viewport = () => (isRoot() ? window.innerHeight : scroller.clientHeight);
  const maxScroll = () => Math.max(0, scroller.scrollHeight - viewport());
  const atEnd = () => position() >= maxScroll() - 2;

  function scrollByPx(px) {
    const target = isRoot() ? window : scroller;
    try {
      target.scrollBy({ top: px, left: 0, behavior: "instant" });
    } catch {
      scroller.scrollTop += px;
    }
  }

  /* ---------- next chapter ---------- */

  const NEXT = /\bnext\b|\bnxt\b|siguiente|suivant|weiter|próximo|다음|次|下一|›|»|→|>>/i;
  const PREV = /\bprev|previous|\bback\b|anterior|précédent|이전|前|上一|‹|«|←|<</i;

  function findNext() {
    const rel = document.querySelector('a[rel~="next"][href], link[rel~="next"][href]');
    if (rel && rel.href && !rel.href.startsWith("javascript:")) return rel;
    const here = location.href.split("#")[0];
    let best = null;
    let bestScore = 0;
    for (const link of document.querySelectorAll("a[href]")) {
      if (hostEl && hostEl.contains(link)) continue;
      const href = link.href || "";
      if (!href || href.startsWith("javascript:") || href.split("#")[0] === here) continue;
      const label = [link.textContent, link.getAttribute("aria-label"), link.title, link.className, link.id]
        .filter((part) => typeof part === "string")
        .join(" ")
        .trim()
        .slice(0, 200);
      if (!NEXT.test(label) || PREV.test(label)) continue;
      let score = 1;
      if (/chap|ch\.|episode|\bep\b|회|話|章/i.test(label)) score += 3;
      if (/\bnext\b/i.test(label)) score += 1;
      if (link.offsetParent !== null) score += 1;
      if (score > bestScore) {
        best = link;
        bestScore = score;
      }
    }
    return best;
  }

  /* ---------- state ---------- */

  let open = false;
  let collapsed = false;
  let playing = false;
  let held = false;
  let raf = 0;
  let last = 0;
  let carry = 0;
  let stuckFrames = 0;
  let endSince = 0;
  let ended = false;
  let countdown = 0;
  let countdownTimer = 0;
  let wakeLock = null;
  let panelOpen = false;
  let hovering = false;

  /* ---------- toolbar ---------- */

  const icon = (path) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const ICON = {
    play: icon('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
    pause: icon('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
    minus: icon('<path d="M5 12h14"/>'),
    plus: icon('<path d="M5 12h14M12 5v14"/>'),
    gear: icon('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    shrink: icon('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>'),
    close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
    next: icon('<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>'),
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font: inherit; color: inherit; }
    .wrap {
      --bg: rgb(30 27 22 / 0.92); --fg: #f3eee6; --dim: #b8ae9f; --soft: rgb(255 253 250 / 0.1);
      --soft-2: rgb(255 253 250 / 0.17); --accent: #e3b46a; --ease: cubic-bezier(0.2, 0.9, 0.3, 1);
      position: fixed; left: 50%; z-index: 2147483647; transform: translateX(-50%);
      width: min(620px, calc(100vw - 16px)); display: flex; flex-direction: column; gap: 6px;
      font: 500 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg);
      -webkit-font-smoothing: antialiased; animation: rise 220ms var(--ease);
    }
    .wrap.bottom { bottom: max(10px, env(safe-area-inset-bottom)); }
    .wrap.top { top: 10px; flex-direction: column-reverse; }
    .wrap.mini { width: auto; }
    .bar, .panel, .pill {
      background: var(--bg); border-radius: 14px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 12px 40px rgb(20 14 6 / 0.35), 0 2px 8px rgb(20 14 6 / 0.2);
      transition: opacity 220ms var(--ease);
    }
    .bar { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px; }
    .wrap.dim .bar, .wrap.dim .pill { opacity: 0.22; }
    button {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 32px; min-width: 32px; padding: 0 8px; border-radius: 9px; cursor: pointer; color: var(--fg);
      transition: background-color 150ms var(--ease); flex-shrink: 0;
    }
    button:hover { background: var(--soft); }
    button:active { background: var(--soft-2); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button svg { width: 16px; height: 16px; }
    .play { width: 40px; height: 40px; border-radius: 11px; background: var(--fg); color: #1e1b16; }
    .play:hover { background: #fff; }
    .play svg { width: 18px; height: 18px; }
    .icon { width: 32px; padding: 0; color: var(--dim); }
    .icon:hover { color: var(--fg); }
    .icon.on { color: var(--fg); background: var(--soft); }
    input[type="range"] {
      -webkit-appearance: none; appearance: none; flex: 1; min-width: 60px; height: 32px; background: transparent; cursor: pointer; margin: 0 2px;
    }
    input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(to right, var(--accent) var(--fill, 50%), var(--soft-2) var(--fill, 50%)); }
    input[type="range"]::-moz-range-track { height: 4px; border-radius: 4px; background: var(--soft-2); }
    input[type="range"]::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--accent); }
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: var(--fg); box-shadow: 0 1px 4px rgb(0 0 0 / 0.4); }
    input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--fg); }
    input[type="range"]:focus-visible { outline: none; }
    input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--accent); }
    .speed { min-width: 64px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--dim); font-size: 12px; }
    .speed b { color: var(--fg); font-size: 15px; font-weight: 650; }
    .sep { width: 1px; height: 20px; background: var(--soft-2); margin: 0 4px; flex-shrink: 0; }
    .status { min-width: 92px; white-space: nowrap; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; text-align: center; }
    .notice { display: none; align-items: center; gap: 4px; flex: 1; min-width: 0; padding-left: 6px; white-space: nowrap; }
    .notice span { overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .notice button { background: var(--soft); height: 30px; font-size: 12px; }
    .notice button.go { background: var(--accent); color: #1e1b16; }
    .wrap.noticing .notice { display: flex; }
    .wrap.noticing .controls { display: none; }
    .controls { display: contents; }
    .hold { position: absolute; left: 50%; transform: translate(-50%, -100%); top: -6px; padding: 3px 9px; border-radius: 999px; background: var(--bg); font-size: 11px; color: var(--dim); opacity: 0; transition: opacity 150ms; pointer-events: none; white-space: nowrap; }
    .wrap.top .hold { top: auto; bottom: -6px; transform: translate(-50%, 100%); }
    .wrap.held .hold { opacity: 1; }
    .panel { padding: 12px; display: none; flex-direction: column; gap: 10px; animation: rise 200ms var(--ease); }
    .wrap.panel-open .panel { display: flex; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; }
    .row > span { color: var(--fg); }
    .row small { display: block; color: var(--dim); font-size: 11.5px; font-weight: 400; }
    .chips, .seg { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .chips button, .seg button { height: 28px; font-size: 12px; background: var(--soft); color: var(--dim); }
    .chips button.on, .seg button.on { background: var(--fg); color: #1e1b16; }
    .chips button b { font-weight: 650; }
    .toggle { position: relative; width: 34px; height: 20px; flex-shrink: 0; }
    .toggle input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; z-index: 1; }
    .toggle i { position: absolute; inset: 0; border-radius: 999px; background: var(--soft-2); transition: background-color 180ms var(--ease); }
    .toggle i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--fg); transition: transform 180ms var(--ease); }
    .toggle input:checked + i { background: var(--accent); }
    .toggle input:checked + i::after { transform: translateX(14px); background: #1e1b16; }
    .toggle input:focus-visible + i { outline: 2px solid var(--accent); outline-offset: 2px; }
    select { all: unset; height: 28px; line-height: 28px; padding: 0 10px; border-radius: 9px; background: var(--soft); font-size: 12px; cursor: pointer; }
    select option { color: #1e1b16; }
    .keys { color: var(--dim); font-size: 11.5px; line-height: 1.6; padding-top: 8px; border-top: 1px solid var(--soft); }
    kbd { display: inline-block; min-width: 18px; padding: 0 5px; margin: 0 1px; border-radius: 5px; background: var(--soft); color: var(--fg); font: 600 11px/18px ui-monospace, monospace; text-align: center; }
    .pill { display: none; align-items: center; gap: 2px; padding: 4px; }
    .pill .play { width: 34px; height: 34px; }
    .pill .speed { min-width: 0; padding: 0 6px; }
    .wrap.mini .pill { display: flex; }
    .wrap.mini .bar, .wrap.mini .panel { display: none; }
    @media (max-width: 520px) {
      .status, .sep, .shrink-btn { display: none; }
      .speed { min-width: 52px; }
    }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  const toggleRow = (key, title, hint) =>
    `<label class="row"><span>${title}${hint ? `<small>${hint}</small>` : ""}</span><span class="toggle"><input type="checkbox" data-set="${key}"><i></i></span></label>`;

  const HTML = `
    <div class="wrap" part="wrap">
      <div class="panel" role="group" aria-label="Reader settings">
        <div class="row"><span>Speed presets</span><div class="chips">${PRESETS.map(
          ([name, value]) => `<button type="button" data-preset="${value}">${name} <b>${value}</b></button>`,
        ).join("")}</div></div>
        ${toggleRow("autoNext", "Go to the next chapter at the end", "Finds the Next link on the page")}
        <label class="row"><span>Wait before the next chapter</span><select data-set="nextDelay">${[0, 2, 4, 6, 10, 15]
          .map((value) => `<option value="${value}">${value ? `${value} seconds` : "Right away"}</option>`)
          .join("")}</select></label>
        ${toggleRow("holdPause", "Press and hold the page to pause", "Lets go and it carries on")}
        ${toggleRow("fade", "Fade the bar while reading", "Hover it to bring it back")}
        <div class="row"><span>Bar position</span><div class="seg"><button type="button" data-pos="top">Top</button><button type="button" data-pos="bottom">Bottom</button></div></div>
        <p class="keys"><kbd>Space</kbd> play / pause &nbsp; <kbd>+</kbd><kbd>−</kbd> speed &nbsp; <kbd>N</kbd> next chapter &nbsp; <kbd>H</kbd> shrink &nbsp; <kbd>Esc</kbd> pause</p>
      </div>
      <div class="bar" role="toolbar" aria-label="Manhwa reader">
        <span class="hold">Paused while you hold</span>
        <button type="button" class="play" data-act="play" title="Play / pause (Space)">${ICON.play}</button>
        <div class="controls">
          <button type="button" class="icon" data-act="slower" title="Slower (−)">${ICON.minus}</button>
          <input type="range" min="0" max="1000" step="1" aria-label="Scroll speed">
          <button type="button" class="icon" data-act="faster" title="Faster (+)">${ICON.plus}</button>
          <span class="speed"><b>60</b> px/s</span>
          <span class="sep"></span>
          <span class="status">0%</span>
        </div>
        <div class="notice" role="status"><span></span><button type="button" data-act="cancel">Cancel</button><button type="button" class="go" data-act="next">Next ${ICON.next}</button></div>
        <button type="button" class="icon" data-act="settings" title="Settings">${ICON.gear}</button>
        <button type="button" class="icon shrink-btn" data-act="shrink" title="Shrink (H)">${ICON.shrink}</button>
        <button type="button" class="icon" data-act="close" title="Close the reader">${ICON.close}</button>
      </div>
      <div class="pill">
        <button type="button" class="play" data-act="play" title="Play / pause (Space)">${ICON.play}</button>
        <button type="button" class="speed" data-act="expand" title="Show the toolbar (H)"><b>60</b> px/s</button>
      </div>
    </div>
  `;

  let shadow = null;
  let ui = {};

  function build() {
    hostEl = document.createElement("manhwa-reader");
    hostEl.style.cssText = "all: initial; position: static;";
    shadow = hostEl.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style>${HTML}`;
    const $ = (selector) => shadow.querySelector(selector);
    ui = {
      wrap: $(".wrap"),
      range: $('input[type="range"]'),
      speeds: shadow.querySelectorAll(".speed b"),
      plays: shadow.querySelectorAll(".play"),
      status: $(".status"),
      notice: $(".notice span"),
      noticeCancel: $('.notice [data-act="cancel"]'),
      noticeNext: $('.notice [data-act="next"]'),
      gear: $('[data-act="settings"]'),
    };

    // Keep focus on the page so Space and the arrow keys keep working there.
    ui.wrap.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) event.preventDefault();
    });
    ui.wrap.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.preset) return setSpeed(Number(button.dataset.preset));
      if (button.dataset.pos) {
        settings.position = button.dataset.pos;
        persist();
        return render();
      }
      act(button.dataset.act);
    });
    ui.range.addEventListener("input", () => setSpeed(fromSlider(Number(ui.range.value))));
    for (const input of shadow.querySelectorAll("[data-set]")) {
      input.addEventListener("change", () => {
        const key = input.dataset.set;
        settings[key] = input.type === "checkbox" ? input.checked : Number(input.value);
        persist();
        render();
      });
    }
    ui.wrap.addEventListener("pointerenter", () => {
      hovering = true;
      render();
    });
    ui.wrap.addEventListener("pointerleave", () => {
      hovering = false;
      render();
    });
  }

  // The slider is logarithmic so slow speeds get as much room as fast ones.
  const ratio = Math.log(MAX_SPEED / MIN_SPEED);
  const toSlider = (speed) => Math.round((Math.log(speed / MIN_SPEED) / ratio) * 1000);
  const fromSlider = (value) => clampSpeed(MIN_SPEED * Math.exp((value / 1000) * ratio));
  const step = (speed) => (speed < 30 ? 2 : speed < 100 ? 5 : speed < 250 ? 10 : 25);

  function setSpeed(value) {
    settings.speed = clampSpeed(value);
    persist();
    render();
  }

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "";
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, "0")}`;
  };

  function renderStatus() {
    if (!scroller || !ui.status) return;
    const max = maxScroll();
    const done = max > 0 ? Math.min(100, Math.round((position() / max) * 100)) : 100;
    const left = max > 0 ? (max - position()) / settings.speed : 0;
    ui.status.textContent = left > 1 ? `${done}% · ${formatTime(left)} left` : `${done}%`;
  }

  function render() {
    if (!ui.wrap) return;
    const wrap = ui.wrap;
    wrap.classList.toggle("top", settings.position === "top");
    wrap.classList.toggle("bottom", settings.position !== "top");
    wrap.classList.toggle("mini", collapsed);
    wrap.classList.toggle("panel-open", panelOpen && !collapsed);
    wrap.classList.toggle("held", playing && held);
    wrap.classList.toggle("dim", settings.fade && playing && !held && !hovering && !panelOpen && !countdown);
    wrap.classList.toggle("noticing", Boolean(countdown) || ended);
    ui.gear.classList.toggle("on", panelOpen);
    for (const button of ui.plays) {
      button.innerHTML = playing ? ICON.pause : ICON.play;
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    for (const label of ui.speeds) label.textContent = settings.speed;
    if (document.activeElement !== hostEl || shadow.activeElement !== ui.range) ui.range.value = toSlider(settings.speed);
    ui.range.style.setProperty("--fill", `${(toSlider(settings.speed) / 10).toFixed(1)}%`);
    for (const chip of shadow.querySelectorAll("[data-preset]")) chip.classList.toggle("on", Number(chip.dataset.preset) === settings.speed);
    for (const seg of shadow.querySelectorAll("[data-pos]")) seg.classList.toggle("on", seg.dataset.pos === (settings.position === "top" ? "top" : "bottom"));
    for (const input of shadow.querySelectorAll("[data-set]")) {
      const value = settings[input.dataset.set];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    }
    if (countdown) {
      ui.notice.textContent = `Next chapter in ${countdown}…`;
      ui.noticeCancel.style.display = "";
      ui.noticeNext.style.display = "";
    } else if (ended) {
      const next = findNext();
      ui.notice.textContent = next ? "End of the chapter" : "End of the page";
      ui.noticeCancel.style.display = "none";
      ui.noticeNext.style.display = next ? "" : "none";
    }
    renderStatus();
  }

  /* ---------- scrolling ---------- */

  function bindScroller(next) {
    const target = (el) => (el === rootEl() ? window : el);
    if (scroller) target(scroller).removeEventListener("scroll", onScroll);
    scroller = next;
    target(scroller).addEventListener("scroll", onScroll, { passive: true });
  }

  let statusQueued = false;
  function onScroll() {
    if (statusQueued) return;
    statusQueued = true;
    requestAnimationFrame(() => {
      statusQueued = false;
      if (ended && !atEnd()) {
        ended = false;
        render();
      } else renderStatus();
    });
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    if (held || countdown) return;

    if (atEnd()) {
      carry = 0;
      endSince ||= now;
      // Wait a moment: lazy loaded pages often grow once the bottom comes into view.
      if (now - endSince > 1500) reachEnd();
      return;
    }
    endSince = 0;

    carry += settings.speed * dt;
    const whole = Math.floor(carry);
    if (whole < 1) return;
    carry -= whole;
    const before = position();
    scrollByPx(whole);
    if (position() === before) {
      if (++stuckFrames > 20) {
        stuckFrames = 0;
        bindScroller(findScroller());
      }
    } else stuckFrames = 0;
  }

  async function lockScreen() {
    try {
      if (!wakeLock && navigator.wakeLock && document.visibilityState === "visible") {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => (wakeLock = null));
      }
    } catch {
      wakeLock = null;
    }
  }

  function unlockScreen() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function play() {
    if (!scroller || !document.contains(scroller === rootEl() ? document.documentElement : scroller)) bindScroller(findScroller());
    else if (scroller === rootEl() && !rootCanScroll()) bindScroller(findScroller());
    if (atEnd() && maxScroll() > 0) {
      reachEnd();
      return;
    }
    ended = false;
    playing = true;
    last = 0;
    endSince = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    lockScreen();
    render();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    stopCountdown();
    unlockScreen();
    render();
  }

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdown = 0;
  }

  function reachEnd() {
    const next = settings.autoNext ? findNext() : null;
    playing = false;
    cancelAnimationFrame(raf);
    unlockScreen();
    if (next) {
      if (!settings.nextDelay) return goNext();
      ended = false;
      countdown = settings.nextDelay;
      countdownTimer = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) goNext();
        else render();
      }, 1000);
    } else ended = true;
    render();
  }

  function goNext() {
    const next = findNext();
    stopCountdown();
    ended = false;
    if (!next) {
      ended = true;
      return render();
    }
    data = { ...data, resume: { host, at: Date.now() } };
    store.save(data);
    render();
    if (next.tagName === "LINK") location.href = next.href;
    else next.click();
    // Single page sites swap the chapter without reloading, so pick up from here.
    setTimeout(() => {
      if (!open) return;
      bindScroller(findScroller());
      carry = 0;
      play();
    }, 2500);
  }

  function act(action) {
    switch (action) {
      case "play":
        if (countdown) return goNext();
        return playing ? pause() : play();
      case "slower":
        return setSpeed(settings.speed - step(settings.speed - 1));
      case "faster":
        return setSpeed(settings.speed + step(settings.speed));
      case "settings":
        panelOpen = !panelOpen;
        return render();
      case "shrink":
        collapsed = true;
        panelOpen = false;
        return render();
      case "expand":
        collapsed = false;
        return render();
      case "cancel":
        stopCountdown();
        ended = true;
        return render();
      case "next":
        return goNext();
      case "close":
        return hide();
    }
  }

  /* ---------- page listeners ---------- */

  const editable = (el) =>
    el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el.type === "range" && hostEl.shadowRoot.contains(el));

  function onKey(event) {
    if (!open || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.composedPath()[0];
    if (editable(target)) return;
    const key = event.key;
    if (key === " " || key === "Spacebar") act("play");
    else if (key === "+" || key === "=") act("faster");
    else if (key === "-" || key === "_" || key === "−") act("slower");
    else if (key === "h" || key === "H") act(collapsed ? "expand" : "shrink");
    else if ((key === "n" || key === "N") && findNext()) goNext();
    else if (key === "Escape" && (playing || countdown || panelOpen)) {
      panelOpen = false;
      pause();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerDown(event) {
    if (!settings.holdPause || !playing || event.button > 0) return;
    if (event.composedPath().includes(hostEl)) return;
    held = true;
    render();
  }

  function onPointerUp() {
    if (!held) return;
    held = false;
    last = 0;
    render();
  }

  function onVisibility() {
    if (document.visibilityState === "visible" && playing) lockScreen();
  }

  function onResize() {
    renderStatus();
  }

  /* ---------- open / close ---------- */

  function show({ autoplay = false } = {}) {
    if (open) return;
    if (!hostEl) build();
    open = true;
    collapsed = false;
    (document.body || document.documentElement).appendChild(hostEl);
    bindScroller(findScroller());
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("blur", onPointerUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    render();
    if (autoplay) play();
  }

  function hide() {
    if (!open) return;
    pause();
    open = false;
    panelOpen = false;
    held = false;
    ended = false;
    hostEl.remove();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    window.removeEventListener("blur", onPointerUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    if (scroller) (scroller === rootEl() ? window : scroller).removeEventListener("scroll", onScroll);
    scroller = null;
  }

  const api = {
    toggle: () => (open ? hide() : show()),
    show,
    hide,
    play: () => (open ? play() : show({ autoplay: true })),
    pause,
    destroy() {
      hide();
      if (onMessage) chrome.runtime.onMessage.removeListener(onMessage);
      delete window.__manhwaReader;
    },
  };
  window.__manhwaReader = api;

  let onMessage = null;
  if (EXT) {
    onMessage = (message) => {
      if (message && message.type === "manhwa-reader:toggle") api.toggle();
    };
    chrome.runtime.onMessage.addListener(onMessage);
  }

  /* ---------- start ---------- */

  const ready = store.load().then((saved) => {
    data = saved || {};
    if (!DEFAULTS.ignoreSaved) {
      Object.assign(settings, pick(data.settings));
      const siteSpeed = data.sites && data.sites[host];
      if (siteSpeed) settings.speed = clampSpeed(siteSpeed);
    }
    const resume = data.resume;
    const resuming = resume && resume.host === host && Date.now() - resume.at < 90_000;
    if (resume) {
      data = { ...data, resume: null };
      store.save(data);
    }
    return resuming;
  });

  ready.then((resuming) => {
    if (resuming) {
      // Arrived here from the previous chapter: give the images a moment, then carry on.
      show();
      setTimeout(() => open && play(), 1500);
    } else if (!EXT) show();
    else render();
  });
})();
