/*
 * Manhwa reader: a floating auto-scroll toolbar for long strip comics.
 * One source runs three ways: as a bookmarklet, as the browser extension's
 * content script, and on the tool page's preview. The wrapper may define
 * MR_DEFAULTS with the starting settings picked on the tool page.
 */
(() => {
  "use strict";

  // Bump on every change: the extension's version is read from here, and the toolbar shows it.
  const VERSION = "1.1.0";
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
    if (source.nextBy === "auto" || source.nextBy === "url") out.nextBy = source.nextBy;
    if (source.nextDelay != null) out.nextDelay = Math.min(30, Math.max(0, Math.round(Number(source.nextDelay) || 0)));
    return out;
  };

  let data = {};
  const settings = { speed: 60, position: "bottom", autoNext: true, nextBy: "auto", nextDelay: 4, holdPause: true, fade: true, ...pick(DEFAULTS) };

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

  // The page's window, or the floating window while the chapter floats on top.
  let win = window;
  let doc = document;
  const rootEl = () => doc.scrollingElement || doc.documentElement;
  const scrollable = (value) => value === "auto" || value === "scroll" || value === "overlay";
  let hostEl = null;

  function rootCanScroll() {
    const root = rootEl();
    if (root.scrollHeight - win.innerHeight < 40) return false;
    const html = win.getComputedStyle(doc.documentElement).overflowY;
    const body = doc.body ? win.getComputedStyle(doc.body).overflowY : "visible";
    return (html !== "visible" ? html : body) !== "hidden";
  }

  function findScroller() {
    if (rootCanScroll()) return rootEl();
    let best = null;
    let bestArea = 0;
    for (const el of doc.querySelectorAll("body *")) {
      if (el === hostEl || el.clientHeight < 160 || el.scrollHeight - el.clientHeight < 40) continue;
      if (!scrollable(win.getComputedStyle(el).overflowY)) continue;
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
  const viewport = () => (isRoot() ? win.innerHeight : scroller.clientHeight);
  const maxScroll = () => Math.max(0, scroller.scrollHeight - viewport());
  const atEnd = () => position() >= maxScroll() - 2;

  function scrollByPx(px) {
    const target = isRoot() ? win : scroller;
    try {
      target.scrollBy({ top: px, left: 0, behavior: "instant" });
    } catch {
      scroller.scrollTop += px;
    }
  }

  /* ---------- next chapter ---------- */

  // Sites link chapters in very different ways, so this tries, in order: the
  // page's own rel=next, a link to chapter N+1, a Next link or button, a
  // chapter picker, and finally the same address with the number bumped.
  const NEXT = /\bnext\b|\bnxt\b|siguiente|suivant|weiter|próximo|proximo|다음|次|下一|›|»|→|>>|chevron-right|arrow-right|angle-right|caret-right/i;
  const PREV = /\bprev|previous|\bback\b|anterior|précédent|이전|前|上一|‹|«|←|<<|chevron-left|arrow-left|angle-left|caret-left|\bhome\b|\blist\b/i;
  const CHAPTER = /(chapters?|chap|ch|episodes?|ep|eps|capitulo|cap|issue)([-_./\s]*)(\d+)(?:[.-](\d+))?/gi;

  /** The last chapter-like number in an address, with where it sits. */
  function chapterOf(href) {
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname + url.search);
    } catch {
      path = url.pathname + url.search;
    }
    let last = null;
    for (const match of path.matchAll(CHAPTER)) last = match;
    if (!last) {
      // No "chapter" word: take a small number ending the address, as in /title/12 or /title-12/.
      const pathname = path.slice(0, path.length - url.search.length);
      const tail = pathname.match(/([/_-])(\d{1,4})(?:[.-](\d{1,2}))?\/?$/);
      if (!tail || Number(tail[2]) > 3000) return null;
      last = Object.assign(["", "", "", tail[2], tail[3]], { index: tail.index + 1 });
      last[0] = tail[0].slice(1).replace(/\/$/, "");
    }
    const minor = last[4] && last[4].length <= 2 ? Number(`0.${last[4]}`) : 0;
    return { url, path, match: last, number: Number(last[3]) + minor, prefix: path.slice(0, last.index) };
  }

  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
  const disabled = (el) =>
    el.disabled || el.getAttribute("aria-disabled") === "true" || /\bdisabled\b/i.test(typeof el.className === "string" ? el.className : "");
  const labelOf = (el) =>
    [el.textContent, el.getAttribute("aria-label"), el.title, el.getAttribute("data-tooltip"), typeof el.className === "string" ? el.className : "", el.id]
      .concat([...el.querySelectorAll("svg, i, span[class], img[alt]")].slice(0, 4).map((icon) => `${icon.getAttribute("class") || ""} ${icon.getAttribute("alt") || ""}`))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

  const clickTarget = (el, how) => ({ how, el, go: () => el.click() });

  function findNext() {
    const own = (el) => !(hostEl && (hostEl === el || hostEl.contains(el)));
    const here = location.href.split("#")[0];
    const current = chapterOf(location.href);

    const rel = document.querySelector('a[rel~="next"][href], link[rel~="next"][href]');
    if (rel && rel.href && !rel.href.startsWith("javascript:") && rel.href.split("#")[0] !== here) {
      return rel.tagName === "LINK" ? { how: "rel", go: () => (location.href = rel.href) } : clickTarget(rel, "rel");
    }

    if (settings.nextBy === "url") return current ? bumped(current) : null;

    const links = [...document.querySelectorAll("a[href]")].filter(own);

    // A link to the following chapter of the same series.
    if (current) {
      let best = null;
      for (const link of links) {
        const target = chapterOf(link.href);
        if (!target || target.url.host !== location.host || target.prefix !== current.prefix) continue;
        if (target.number <= current.number || target.number >= current.number + 2) continue;
        if (!best || target.number < best.number || (target.number === best.number && visible(link) && !visible(best.link))) {
          best = { link, number: target.number };
        }
      }
      if (best) return clickTarget(best.link, "chapter link");
    }

    // A Next link or button, by its words, label or icon.
    let best = null;
    let bestScore = 0;
    const clickables = new Set([...links, ...document.querySelectorAll('button, [role="button"], [onclick], [class*="next" i], [id*="next" i]')]);
    for (const el of clickables) {
      if (!own(el) || disabled(el)) continue;
      if (el.tagName === "A") {
        const href = el.href || "";
        if (href.split("#")[0] === here && !el.hasAttribute("onclick")) continue;
      }
      const label = labelOf(el);
      if (!label || !NEXT.test(label) || PREV.test(label)) continue;
      if (el.textContent.trim().length > 60) continue;
      let score = 1;
      if (/chap|ch\.|episode|\bep\b|회|話|章/i.test(label)) score += 3;
      if (/\bnext\b/i.test(label)) score += 2;
      if (/page|slide|carousel|swiper|banner/i.test(label)) score -= 3;
      if (visible(el)) score += 1;
      if (el.tagName === "A" || el.tagName === "BUTTON") score += 1;
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    if (best && bestScore >= 2) return clickTarget(best, "next button");

    // A chapter picker: choose the option after this chapter.
    if (current) {
      for (const select of document.querySelectorAll("select")) {
        if (!own(select)) continue;
        const options = [...select.options].map((option) => ({ option, number: Number((option.textContent.match(/\d+(?:\.\d+)?/) || [])[0]) }));
        if (options.filter((item) => Number.isFinite(item.number)).length < 2) continue;
        const after = options
          .filter((item) => item.number > current.number && item.number < current.number + 2)
          .sort((a, b) => a.number - b.number)[0];
        if (!after) continue;
        return {
          how: "chapter list",
          go: () => {
            select.value = after.option.value;
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
            // Some pickers hold the address in the option itself.
            setTimeout(() => {
              const value = after.option.value;
              if (location.href.split("#")[0] === here && /^(https?:)?\/|^[\w-]+\//.test(value)) location.href = new URL(value, location.href).href;
            }, 1200);
          },
        };
      }
    }

    // Last resort: the same address with the chapter number bumped by one.
    return current ? bumped(current) : null;
  }

  function bumped(current) {
    const { match, path, url } = current;
    const next = `${path.slice(0, match.index)}${match[1]}${match[2]}${Math.floor(current.number) + 1}${path.slice(match.index + match[0].length)}`;
    const [pathname, search = ""] = next.split("?");
    const target = new URL(url.href);
    target.pathname = pathname;
    target.search = search ? `?${search}` : "";
    target.hash = "";
    return { how: "guessed address", check: target.href, go: () => (location.href = target.href) };
  }

  /** Bottom of the last chapter panel, so comments below it don't hold up the next chapter. */
  let panelsCheckedAt = 0;
  let lastPanel = null;
  function pastLastPanel(now) {
    if (pip || !settings.autoNext) return false;
    if (now - panelsCheckedAt > 2000) {
      panelsCheckedAt = now;
      const images = chapterImages();
      lastPanel = images.length >= 3 ? images[images.length - 1].el : null;
    }
    if (!lastPanel || !lastPanel.isConnected) return false;
    const rect = lastPanel.getBoundingClientRect();
    if (rect.height < 50) return false;
    const bottom = isRoot() ? window.innerHeight : scroller.getBoundingClientRect().bottom;
    return rect.bottom <= bottom - 8;
  }

  /* ---------- chapter images, for the floating window ---------- */

  const LAZY_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-url", "data-cfsrc", "data-echo", "data-lazy"];

  function imageSource(img) {
    for (const name of LAZY_ATTRS) {
      const value = (img.getAttribute(name) || "").trim();
      if (!value || value.startsWith("data:")) continue;
      try {
        return new URL(value, location.href).href;
      } catch {
        /* not a usable address, try the next one */
      }
    }
    const src = img.currentSrc || img.src || "";
    if (src.startsWith("data:") && img.naturalWidth < 200) return "";
    return src;
  }

  /** The chapter's panels in reading order, skipping logos, avatars and ads around them. */
  function chapterImages() {
    const minWidth = Math.min(280, window.innerWidth * 0.35);
    const found = [];
    for (const img of document.images) {
      if (img.getBoundingClientRect().width < minWidth || !imageSource(img)) continue;
      found.push(img);
    }
    if (found.length === 0) return [];
    // The deepest block holding most of the big images is the reader itself.
    const counts = new Map();
    for (const img of found) {
      for (let el = img.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const entry = counts.get(el) || { count: 0, el };
        entry.count += 1;
        counts.set(el, entry);
      }
    }
    let box = null;
    let boxDepth = -1;
    for (const { el, count } of counts.values()) {
      if (count < found.length * 0.7) continue;
      let depth = 0;
      for (let node = el; node; node = node.parentElement) depth += 1;
      if (depth > boxDepth) {
        box = el;
        boxDepth = depth;
      }
    }
    const seen = new Set();
    return found
      .filter((img) => !box || box.contains(img))
      .map((img) => {
        const src = imageSource(img);
        const loaded = img.complete && img.naturalWidth > 1 && img.currentSrc === src;
        return {
          el: img,
          src,
          width: loaded ? img.naturalWidth : Number(img.getAttribute("width")) || 0,
          height: loaded ? img.naturalHeight : Number(img.getAttribute("height")) || 0,
        };
      })
      .filter((item) => !seen.has(item.src) && seen.add(item.src));
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
  let pip = null;
  let floated = [];
  let tip = "";
  let tipTimer = 0;
  const canFloat = () => "documentPictureInPicture" in window && window.top === window;

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
    float: icon('<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><rect x="12" y="11.5" width="7" height="6" rx="1" fill="currentColor"/>'),
    dock: icon('<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M15 9l-5 5M10 9.5V14h4.5"/>'),
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
    .wrap.tipping .hold { opacity: 1; }
    .float-btn[hidden] { display: none; }
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
    .ver { float: right; opacity: 0.7; font-variant-numeric: tabular-nums; }
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
        <div class="row"><span>Find the next chapter by<small>The address works on sites with chapter-6 style links</small></span><div class="seg"><button type="button" data-next-by="auto">Smart</button><button type="button" data-next-by="url">Address</button></div></div>
        <label class="row"><span>Wait before the next chapter</span><select data-set="nextDelay">${[0, 2, 4, 6, 10, 15]
          .map((value) => `<option value="${value}">${value ? `${value} seconds` : "Right away"}</option>`)
          .join("")}</select></label>
        ${toggleRow("holdPause", "Press and hold the page to pause", "Lets go and it carries on")}
        ${toggleRow("fade", "Fade the bar while reading", "Hover it to bring it back")}
        <div class="row"><span>Bar position</span><div class="seg"><button type="button" data-pos="top">Top</button><button type="button" data-pos="bottom">Bottom</button></div></div>
        <p class="keys"><kbd>Space</kbd> play / pause &nbsp; <kbd>+</kbd><kbd>−</kbd> speed &nbsp; <kbd>N</kbd> next chapter &nbsp; <kbd>F</kbd> float on top &nbsp; <kbd>H</kbd> shrink &nbsp; <kbd>Esc</kbd> pause &nbsp; <span class="ver">v${VERSION}</span></p>
      </div>
      <div class="bar" role="toolbar" aria-label="Manhwa reader">
        <span class="hold" role="status"></span>
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
        <button type="button" class="icon float-btn" data-act="float" title="Float on top of other apps (F)">${ICON.float}</button>
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
      float: $('[data-act="float"]'),
      tip: $(".hold"),
    };

    // Keep focus on the page so Space and the arrow keys keep working there.
    ui.wrap.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) event.preventDefault();
    });
    ui.wrap.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.preset) return setSpeed(Number(button.dataset.preset));
      if (button.dataset.nextBy) {
        settings.nextBy = button.dataset.nextBy;
        persist();
        return render();
      }
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

  function flash(message) {
    tip = message;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      tip = "";
      render();
    }, 3500);
    render();
  }

  function render() {
    if (!ui.wrap) return;
    const wrap = ui.wrap;
    const tipText = playing && held ? "Paused while you hold" : tip;
    wrap.classList.toggle("top", settings.position === "top");
    wrap.classList.toggle("bottom", settings.position !== "top");
    wrap.classList.toggle("mini", collapsed);
    wrap.classList.toggle("panel-open", panelOpen && !collapsed);
    wrap.classList.toggle("tipping", Boolean(tipText));
    wrap.classList.toggle("dim", settings.fade && playing && !held && !hovering && !panelOpen && !countdown && !tip);
    wrap.classList.toggle("noticing", Boolean(countdown) || ended);
    if (tipText) ui.tip.textContent = tipText;
    ui.gear.classList.toggle("on", panelOpen);
    ui.float.hidden = !canFloat();
    ui.float.innerHTML = pip ? ICON.dock : ICON.float;
    ui.float.title = pip ? "Back to the page (F)" : "Float on top of other apps (F)";
    ui.float.classList.toggle("on", Boolean(pip));
    for (const button of ui.plays) {
      button.innerHTML = playing ? ICON.pause : ICON.play;
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    for (const label of ui.speeds) label.textContent = settings.speed;
    if (doc.activeElement !== hostEl || shadow.activeElement !== ui.range) ui.range.value = toSlider(settings.speed);
    ui.range.style.setProperty("--fill", `${(toSlider(settings.speed) / 10).toFixed(1)}%`);
    for (const chip of shadow.querySelectorAll("[data-preset]")) chip.classList.toggle("on", Number(chip.dataset.preset) === settings.speed);
    for (const seg of shadow.querySelectorAll("[data-next-by]")) seg.classList.toggle("on", seg.dataset.nextBy === settings.nextBy);
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

  let scrollTarget = null;
  function bindScroller(next) {
    scrollTarget?.removeEventListener("scroll", onScroll);
    scroller = next;
    scrollTarget = scroller === rootEl() ? win : scroller;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
  }

  function unbindScroller() {
    scrollTarget?.removeEventListener("scroll", onScroll);
    scrollTarget = null;
    scroller = null;
  }

  let statusQueued = false;
  function onScroll() {
    if (statusQueued) return;
    statusQueued = true;
    win.requestAnimationFrame(() => {
      statusQueued = false;
      if (ended && scroller && !atEnd()) {
        ended = false;
        render();
      } else renderStatus();
    });
  }

  // Frames come from whichever window is showing the chapter, so a floating
  // window keeps scrolling even when the tab behind it is covered.
  let rafWin = window;
  function startFrames() {
    stopFrames();
    rafWin = win;
    last = 0;
    raf = rafWin.requestAnimationFrame(frame);
  }

  function stopFrames() {
    rafWin.cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    raf = rafWin.requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    if (held || countdown || !scroller) return;

    if (atEnd() || pastLastPanel(now)) {
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
      const lock = win.navigator.wakeLock;
      if (!wakeLock && lock && doc.visibilityState === "visible") {
        wakeLock = await lock.request("screen");
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
    if (!scroller || !scroller.isConnected || scroller.ownerDocument !== doc || (scroller === rootEl() && !rootCanScroll())) {
      bindScroller(findScroller());
    }
    if (atEnd() && maxScroll() > 0) {
      reachEnd();
      return;
    }
    ended = false;
    playing = true;
    endSince = 0;
    startFrames();
    lockScreen();
    render();
  }

  function pause() {
    playing = false;
    stopFrames();
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
    stopFrames();
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
    // A guessed address might be a chapter that isn't out yet, so look before leaving.
    if (next.check && !next.checked) {
      const controller = new AbortController();
      fetch(next.check, { credentials: "include", signal: controller.signal })
        .then((response) => {
          controller.abort();
          return response.status === 404 || response.status === 410;
        })
        .catch(() => false)
        .then((missing) => {
          if (!open) return;
          if (missing) {
            ended = true;
            flash("That was the latest chapter");
            return;
          }
          next.checked = true;
          leave(next);
        });
      return render();
    }
    leave(next);
  }

  function leave(next) {
    // The floating window belongs to this page, so the next chapter opens back in the tab.
    if (pip) dock({ follow: false });
    data = { ...data, resume: { host, at: Date.now() } };
    store.save(data);
    render();
    next.go();
    // Single page sites swap the chapter without reloading, so pick up from here.
    setTimeout(() => {
      if (!open) return;
      bindScroller(findScroller());
      carry = 0;
      play();
    }, 2500);
  }

  /* ---------- floating window ---------- */

  const FLOAT_CSS = `
    html { background: #0f0d0a; color-scheme: dark; scrollbar-width: thin; scrollbar-color: #5a5349 transparent; }
    body { margin: 0; }
    .strip { display: flex; flex-direction: column; align-items: center; }
    .strip img { display: block; width: 100%; max-width: 1000px; height: auto; min-height: 24px; }
    .end { padding: 48px 16px 140px; text-align: center; color: #8c8274; font: 500 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
  `;

  /** Reads image bytes with the page's own cookies and referrer, for sites that block hotlinking. */
  function retryImage(img, src) {
    fetch(src, { credentials: "include", referrer: location.href })
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then((blob) => (img.src = URL.createObjectURL(blob)))
      .catch(() => img.remove());
  }

  async function float() {
    if (pip) return dock({ follow: true });
    if (!canFloat()) return flash("This browser can't float windows — use Chrome or Edge");
    const images = chapterImages();
    if (images.length === 0) return flash("Couldn't find the chapter images on this page");

    // Start the floating window at the panel you're reading now.
    const startAt = Math.max(0, images.findIndex((item) => item.el.getBoundingClientRect().bottom > window.innerHeight * 0.25));
    let next;
    try {
      next = await window.documentPictureInPicture.requestWindow({
        width: Math.min(520, Math.round(screen.availWidth * 0.4)),
        height: Math.round(screen.availHeight * 0.92),
      });
    } catch {
      return flash("The browser blocked the floating window — click Float again");
    }

    const fdoc = next.document;
    fdoc.title = document.title ? `Reading · ${document.title}` : "Manhwa reader";
    const style = fdoc.createElement("style");
    style.textContent = FLOAT_CSS;
    const strip = fdoc.createElement("div");
    strip.className = "strip";
    floated = images.map((item) => {
      const img = fdoc.createElement("img");
      img.alt = "";
      img.decoding = "async";
      if (item.width && item.height) {
        img.width = item.width;
        img.height = item.height;
      }
      img.addEventListener("error", () => retryImage(img, item.src), { once: true });
      img.src = item.src;
      strip.append(img);
      return { original: item.el, copy: img };
    });
    const end = fdoc.createElement("p");
    end.className = "end";
    end.textContent = "End of the chapter — the next one opens back in your browser tab";
    fdoc.head.append(style);
    fdoc.body.append(strip, end);

    const wasPlaying = playing;
    stopFrames();
    unlockScreen();
    detach();
    unbindScroller();
    pip = next;
    win = next;
    doc = fdoc;
    fdoc.body.append(hostEl);
    attach();
    next.addEventListener("pagehide", () => dock({ follow: true }), { once: true });

    const settle = () => {
      floated[startAt]?.copy.scrollIntoView({ block: "start", behavior: "instant" });
      bindScroller(findScroller());
      if (wasPlaying) play();
      else render();
    };
    // Panels above the start point have to load before jumping there lands right.
    const before = floated.slice(0, startAt).map(({ copy }) => copy);
    const pending = before.filter((img) => !img.complete && !img.hasAttribute("width"));
    if (pending.length === 0) settle();
    else {
      let left = pending.length;
      const done = () => --left === 0 && settle();
      for (const img of pending) {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
      setTimeout(() => left > 0 && ((left = 0), settle()), 2500);
    }
  }

  /** Brings the toolbar back to the tab, at the panel the floating window was on. */
  function dock({ follow }) {
    if (!pip) return;
    const closing = pip;
    const wasPlaying = playing;
    let reading = null;
    if (follow && scroller) {
      const top = position();
      reading = floated.find(({ copy }) => copy.offsetTop + copy.offsetHeight > top + 40)?.original;
    }
    stopFrames();
    unlockScreen();
    detach();
    unbindScroller();
    pip = null;
    floated = [];
    win = window;
    doc = document;
    if (open) {
      (document.body || document.documentElement).appendChild(hostEl);
      attach();
      reading?.scrollIntoView({ block: "start", behavior: "instant" });
      bindScroller(findScroller());
      if (wasPlaying && follow) play();
      else if (wasPlaying) playing = false;
      render();
    } else hostEl.remove();
    try {
      closing.close();
    } catch {
      /* already closed */
    }
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
      case "float":
        return float();
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
    else if ((key === "f" || key === "F") && canFloat()) float();
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
    if (doc.visibilityState === "visible" && playing) lockScreen();
  }

  function onResize() {
    renderStatus();
  }

  let attached = null;
  function attach() {
    attached = { win, doc };
    win.addEventListener("keydown", onKey, true);
    win.addEventListener("pointerdown", onPointerDown, true);
    win.addEventListener("pointerup", onPointerUp, true);
    win.addEventListener("pointercancel", onPointerUp, true);
    win.addEventListener("blur", onPointerUp);
    win.addEventListener("resize", onResize);
    doc.addEventListener("visibilitychange", onVisibility);
  }

  function detach() {
    if (!attached) return;
    const { win: w, doc: d } = attached;
    w.removeEventListener("keydown", onKey, true);
    w.removeEventListener("pointerdown", onPointerDown, true);
    w.removeEventListener("pointerup", onPointerUp, true);
    w.removeEventListener("pointercancel", onPointerUp, true);
    w.removeEventListener("blur", onPointerUp);
    w.removeEventListener("resize", onResize);
    d.removeEventListener("visibilitychange", onVisibility);
    attached = null;
  }

  /* ---------- open / close ---------- */

  function show({ autoplay = false } = {}) {
    if (open) return;
    if (!hostEl) build();
    open = true;
    collapsed = false;
    (document.body || document.documentElement).appendChild(hostEl);
    bindScroller(findScroller());
    attach();
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
    dock({ follow: true });
    hostEl.remove();
    detach();
    unbindScroller();
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
