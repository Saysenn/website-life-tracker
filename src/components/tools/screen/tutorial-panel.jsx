"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Choice } from "../video/controls";
import { Group, Row } from "./panels";
import { INK_COLORS, TUTORIAL_TOOLS } from "./tutorial-pad";

const CLICK_COLORS = ["#f2c94c", "#e0453a", "#2f6fd6", "#4f8a3c", "#ffffff"];

function Swatches({ colors, value, onChange, label }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`${label} ${color}`}
          aria-pressed={value === color}
          className={cn("flex size-8 items-center justify-center rounded-full transition-colors", value === color ? "bg-selected" : "hover:bg-hover")}
        >
          <span className="size-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: color }} />
        </button>
      ))}
      <label className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-hover" title="Any colour">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={`Custom ${label}`} />
      </label>
    </div>
  );
}

/** Tutorial mode: click-to-zoom that follows typing, a magnifier, click ripples, drawing and key badges. */
export function TutorialPanel({ cfg, set, extension, live, isMac }) {
  const off = !cfg.tutorial;
  return (
    <div className="flex flex-col gap-3">
      <Group>
        <Row
          label="Tutorial mode"
          hint={
            live && !cfg.tutorial
              ? "Turn it on before you start — it can't be added to a recording that's already running."
              : "Zoom in where you click, keep following while you type, magnify, draw and show shortcuts — all inside the recording."
          }
        >
          <Switch checked={cfg.tutorial} onCheckedChange={(tutorial) => set({ tutorial })} disabled={live} />
        </Row>
      </Group>

      <Group title="How you drive it">
        <div className="flex flex-col gap-2 py-3 text-sm text-ink-2">
          <p>
            <b>In browser tabs:</b> with the extension installed (Shortcuts &amp; app tab), your real clicks zoom in, typing keeps the zoom following the cursor, and shortcuts like{" "}
            {isMac ? "⌘ C" : "Ctrl C"} pop up on screen. Press <b>{isMac ? "⌥ ⇧ D" : "Alt Shift D"}</b> to draw right on the page.{" "}
            <span className={cn("font-semibold", extension ? "text-success" : "text-ink-3")}>{extension ? "Extension connected." : "Extension not installed."}</span>
          </p>
          <p>
            <b>Anywhere else</b> (desktop apps, other windows): use the live pad in the floating bar or on this page — click a spot to zoom there, hover with the magnifier, or draw on it.
            Browsers can&apos;t see clicks outside their own tabs, so the pad stands in for them.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {TUTORIAL_TOOLS.map((tool) => (
              <span key={tool.value} className="flex items-center gap-1.5 rounded-lg bg-sunken px-2 py-1 text-xs">
                <kbd className="rounded bg-surface px-1.5 font-sans text-2xs font-semibold shadow-card">{tool.key}</kbd>
                {tool.label}
              </span>
            ))}
            {[
              ["Z", "Zoom out"],
              ["U", "Undo"],
              ["C", "Clear"],
            ].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5 rounded-lg bg-sunken px-2 py-1 text-xs">
                <kbd className="rounded bg-surface px-1.5 font-sans text-2xs font-semibold shadow-card">{key}</kbd>
                {label}
              </span>
            ))}
          </div>
        </div>
      </Group>

      <Group title="Zoom">
        <Row label="Zoom in where I click" hint="Right-click the pad or press Z to zoom back out." disabled={off}>
          <Switch checked={cfg.tZoomOnClick} onCheckedChange={(tZoomOnClick) => set({ tZoomOnClick })} disabled={off} />
        </Row>
        <Row label="Keep following while I type" hint="The zoom stays on and moves with the text cursor while you type (browser tabs, with the extension)." disabled={off}>
          <Switch checked={cfg.tFollowTyping} onCheckedChange={(tFollowTyping) => set({ tFollowTyping })} disabled={off} />
        </Row>
        <div className="grid gap-3 py-3 sm:grid-cols-3">
          <Choice
            label="How close"
            value={cfg.tZoomLevel}
            onChange={(tZoomLevel) => set({ tZoomLevel })}
            disabled={off}
            options={[
              { value: 1.5, label: "1.5×" },
              { value: 2, label: "2×" },
              { value: 2.5, label: "2.5×" },
              { value: 3, label: "3×" },
            ]}
          />
          <Choice
            label="Zoom out after"
            value={cfg.tZoomOutAfter}
            onChange={(tZoomOutAfter) => set({ tZoomOutAfter })}
            disabled={off}
            options={[
              { value: 2, label: "2s" },
              { value: 3, label: "3s" },
              { value: 6, label: "6s" },
              { value: 0, label: "Never" },
            ]}
          />
          <Choice
            label="Motion"
            value={cfg.tZoomSpeed}
            onChange={(tZoomSpeed) => set({ tZoomSpeed })}
            disabled={off}
            options={[
              { value: "smooth", label: "Smooth" },
              { value: "fast", label: "Quick" },
            ]}
          />
        </div>
      </Group>

      <Group title="Magnifier">
        <div className="grid gap-3 py-3 sm:grid-cols-2">
          <Choice
            label="Lens size"
            value={cfg.tLensSize}
            onChange={(tLensSize) => set({ tLensSize })}
            disabled={off}
            options={[
              { value: "s", label: "Small" },
              { value: "m", label: "Medium" },
              { value: "l", label: "Large" },
            ]}
          />
          <Choice
            label="Magnification"
            value={cfg.tLensPower}
            onChange={(tLensPower) => set({ tLensPower })}
            disabled={off}
            options={[
              { value: 1.5, label: "1.5×" },
              { value: 2, label: "2×" },
              { value: 3, label: "3×" },
            ]}
          />
        </div>
      </Group>

      <Group title="Clicks and keys">
        <Row label="Show clicks" hint="A ring pops where you click." disabled={off}>
          <Switch checked={cfg.tClicks} onCheckedChange={(tClicks) => set({ tClicks })} disabled={off} />
        </Row>
        {cfg.tClicks && (
          <Row label="Click colour" disabled={off}>
            <Swatches colors={CLICK_COLORS} value={cfg.tClickColor} onChange={(tClickColor) => set({ tClickColor })} label="Click colour" />
          </Row>
        )}
        <Row label="Show keyboard shortcuts" hint={`Shortcuts like ${isMac ? "⌘ S" : "Ctrl S"} appear at the bottom (browser tabs, with the extension). Plain typing is never shown.`} disabled={off}>
          <Switch checked={cfg.tKeys} onCheckedChange={(tKeys) => set({ tKeys })} disabled={off} />
        </Row>
      </Group>

      <Group title="Drawing">
        <Row label="Ink" disabled={off}>
          <Swatches colors={INK_COLORS} value={cfg.tInk} onChange={(tInk) => set({ tInk })} label="Ink" />
        </Row>
        <div className="grid gap-3 py-3 sm:grid-cols-2">
          <Choice
            label="Line width"
            value={cfg.tInkWidth}
            onChange={(tInkWidth) => set({ tInkWidth })}
            disabled={off}
            options={[
              { value: "s", label: "Thin" },
              { value: "m", label: "Medium" },
              { value: "l", label: "Bold" },
            ]}
          />
          <Choice
            label="Drawings fade after"
            value={cfg.tFade}
            onChange={(tFade) => set({ tFade })}
            disabled={off}
            options={[
              { value: 3, label: "3s" },
              { value: 6, label: "6s" },
              { value: 12, label: "12s" },
              { value: 0, label: "Stay" },
            ]}
          />
        </div>
      </Group>
    </div>
  );
}
