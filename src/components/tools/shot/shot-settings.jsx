"use client";

import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { BACKDROPS, backdropCss, fileName } from "@/lib/tools/shot/render";
import { OCR_LANGUAGES } from "@/lib/tools/video/ocr";
import { cn } from "@/lib/utils";
import { SaveLocation } from "../save-location";
import { Group, Row, Slider } from "../screen/panels";
import { Choice, Select } from "../video/controls";
import { EDIT_TOOLS } from "./editor";
import { Keys } from "./shot-launch";

/** Backdrop look: gradient or colour, padding, corners, shadow and shape. */
export function BackdropControls({ value, onChange, compact = false }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-1")}>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Background">
        {BACKDROPS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={value.bg === preset.value}
            title={preset.label}
            aria-label={preset.label}
            onClick={() => set({ bg: preset.value, on: true })}
            className={cn("aspect-square rounded-lg ring-1 ring-black/10 transition-transform hover:scale-105", value.bg === preset.value && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
            style={{ background: backdropCss(preset.value) }}
          />
        ))}
      </div>
      <Row label="Padding" stack={compact}>
        <Slider value={value.padding} onChange={(padding) => set({ padding })} min={0} max={25} step={1} label="Padding" format={(v) => `${v}%`} />
      </Row>
      <Row label="Corners" stack={compact}>
        <Slider value={value.radius} onChange={(radius) => set({ radius })} min={0} max={6} step={0.25} label="Corner radius" format={(v) => (v ? `${v}%` : "Square")} />
      </Row>
      <Row label="Shadow">
        <Switch checked={value.shadow} onCheckedChange={(shadow) => set({ shadow })} aria-label="Shadow" />
      </Row>
      <Choice
        label="Shape"
        value={value.aspect}
        onChange={(aspect) => set({ aspect })}
        options={[
          { value: "auto", label: "Fit" },
          { value: "16:9", label: "16:9" },
          { value: "4:3", label: "4:3" },
          { value: "1:1", label: "1:1" },
        ]}
      />
    </div>
  );
}

/** All of Screenshotr's settings. */
export function ShotSettings({ s, set, folder, isMac }) {
  const mod = isMac ? "⌘" : "Ctrl";
  const alt = isMac ? "⌥" : "Alt";
  const shift = isMac ? "⇧" : "Shift";
  const example = fileName(s.pattern, { n: 1, width: 1920, height: 1080, ext: s.format });

  return (
    <div className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Group title="Capturing">
          <Row
            label="Screen and area captures"
            hint="Your browser is in front when you click, so by default Screenshotr waits until you switch to the app or window you want, then takes the picture. Window captures never need to wait."
            stack
          >
            <Choice
              label="Take the picture"
              value={s.when}
              onChange={(when) => set({ when })}
              options={[
                { value: "leave", label: "When I switch away", note: "recommended" },
                { value: "now", label: "Right away", note: "includes this window" },
              ]}
            />
          </Row>
          <Row label="Delayed capture" hint="Time to open a menu or hover something before the picture is taken.">
            <Select
              label="Delay"
              value={String(s.delay)}
              onChange={(v) => set({ delay: Number(v) })}
              options={[
                ["3", "3 seconds"],
                ["5", "5 seconds"],
                ["10", "10 seconds"],
              ]}
            />
          </Row>
          <Row
            label="Keep the screen shared"
            hint="Ask once, then every capture is instant until you stop sharing or close the tab. The browser shows that the screen is being shared."
          >
            <Switch checked={s.keep} onCheckedChange={(keep) => set({ keep })} aria-label="Keep the screen shared" />
          </Row>
          <Row label="Adjust the area before taking it" hint="Off: the picture is taken the moment you let go. On: drag the corners or nudge with the arrow keys, then press Enter.">
            <Switch checked={s.areaConfirm} onCheckedChange={(areaConfirm) => set({ areaConfirm })} aria-label="Adjust the area before taking it" />
          </Row>
          <Row label="Magnifier while selecting" hint="Shows the pixels, colour and position under the cursor.">
            <Switch checked={s.loupe} onCheckedChange={(loupe) => set({ loupe })} aria-label="Magnifier while selecting" />
          </Row>
          <Row label="Shutter sound">
            <Switch checked={s.sound} onCheckedChange={(sound) => set({ sound })} aria-label="Shutter sound" />
          </Row>
        </Group>

        <Group title="After a capture">
          <Row label="Also do this straight away" hint="The screenshot always opens in the editor and is kept in the history below." stack>
            <Choice
              label="After capture"
              value={s.after}
              onChange={(after) => set({ after })}
              options={[
                { value: "none", label: "Nothing" },
                { value: "copy", label: "Copy" },
                { value: "save", label: "Save" },
                { value: "both", label: "Copy + save" },
              ]}
            />
          </Row>
        </Group>

        <Group title="Saving">
          <SaveLocation value={s.saveTo} onChange={(saveTo) => set({ saveTo })} folder={folder} what="screenshots" />
          <Row label="Format">
            <div className="w-full sm:w-64">
              <Choice
                label="Format"
                value={s.format}
                onChange={(format) => set({ format })}
                options={[
                  { value: "png", label: "PNG", note: "sharp" },
                  { value: "jpg", label: "JPG", note: "smaller" },
                ]}
              />
            </div>
          </Row>
          {s.format === "jpg" && (
            <Row label="JPG quality">
              <Slider value={s.quality} onChange={(quality) => set({ quality })} min={0.5} max={1} step={0.01} label="JPG quality" />
            </Row>
          )}
          <Row label="Size" hint="Retina screens capture 2 pixels per point. 1× halves the file to what a normal screen shows.">
            <div className="w-full sm:w-64">
              <Choice
                label="Size"
                value={s.scale}
                onChange={(scale) => set({ scale })}
                options={[
                  { value: "2x", label: "Full (2×)" },
                  { value: "1x", label: "1×" },
                ]}
              />
            </div>
          </Row>
          <Row label="File name" hint={`Use {date} {time} {w} {h}. Example: ${example}`} stack>
            <Input value={s.pattern} onChange={(event) => set({ pattern: event.target.value })} placeholder="Screenshot {date} at {time}" aria-label="File name pattern" />
          </Row>
        </Group>
      </div>

      <div className="flex flex-col gap-2">
        <Group title="Backdrop (new screenshots)">
          <Row label="Add a backdrop to new screenshots" hint="Pads the picture on a gradient with rounded corners and a shadow — nice for sharing. Toggle it per screenshot with ⇧B.">
            <Switch checked={s.backdrop.on} onCheckedChange={(on) => set({ backdrop: { ...s.backdrop, on } })} aria-label="Backdrop on new screenshots" />
          </Row>
          <div className="py-3">
            <BackdropControls value={s.backdrop} onChange={(backdrop) => set({ backdrop })} />
          </div>
        </Group>

        <Group title="Text recognition">
          <Row label="Language" hint="The reader downloads once per language, then works offline.">
            <Select label="Language" value={s.ocrLang} onChange={(ocrLang) => set({ ocrLang })} options={OCR_LANGUAGES} />
          </Row>
        </Group>

        <Group title="Shortcuts on this page">
          {[
            [[alt, shift, "A"], "Capture an area"],
            [[alt, shift, "F"], "Capture the full screen"],
            [[alt, shift, "W"], "Capture a window"],
            [[alt, shift, "D"], `Delayed capture (${s.delay}s)`],
            [[alt, shift, "R"], "Repeat the last area"],
            [[mod, "V"], "Paste an image to edit"],
            [[mod, "O"], "Open an image file"],
            [[mod, "C"], "Copy the screenshot"],
            [[mod, "S"], "Save"],
            [[shift, "P"], "Pin on top of other windows"],
            [[shift, "T"], "Read the text (OCR) and QR codes"],
            [[shift, "B"], "Backdrop on / off"],
            [[mod, "Z"], "Undo"],
            [[mod, shift, "Z"], "Redo"],
            [["1–9"], "Pick a colour"],
            [["[", "]"], "Thinner / thicker"],
            [["+", "−", "0"], "Zoom in, out, fit"],
            [["Del"], "Delete the selected shape"],
          ].map(([keys, label]) => (
            <Row key={label} label={label}>
              <Keys keys={keys} />
            </Row>
          ))}
          <Row label="Tools">
            <span className="flex flex-wrap justify-end gap-1">
              {EDIT_TOOLS.map((tool) => (
                <kbd key={tool.id} title={tool.label} className="min-w-7 rounded-md bg-surface px-2 py-1 text-center font-sans text-xs font-semibold shadow-card">
                  {tool.key.toUpperCase()}
                </kbd>
              ))}
            </span>
          </Row>
          <p className="pb-3 text-xs text-ink-3">
            Page shortcuts work while this tab is in front. To capture from any tab, use the browser extension in the Extension tab. Shift while drawing keeps lines straight and boxes square.
          </p>
        </Group>
      </div>
    </div>
  );
}
