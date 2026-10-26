"use client";

import { Check, ShieldAlert } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { exportCompanies } from "@/actions/export";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useStoredState } from "@/hooks/use-stored-state";
import {
  DEFAULT_EXPORT_COLORS,
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLORS,
  EXPORT_SECTIONS,
  NO_GROUP,
  pickColumns,
} from "@/lib/export";
import { isArchived } from "@/lib/services";
import { cn, plural } from "@/lib/utils";

const DEFAULT_PREFS = { format: "xlsx", columns: DEFAULT_EXPORT_COLUMNS, colors: DEFAULT_EXPORT_COLORS, includeArchived: false };

const FORMATS = [
  { value: "xlsx", label: "Excel" },
  { value: "pdf", label: "PDF" },
];

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "export";

function Toggle({ checked, onChange, children, className }) {
  return (
    <label
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm transition-colors select-none",
        checked ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
        className,
      )}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <Check className={cn("size-[1.2rem] shrink-0", checked ? "text-ink" : "text-transparent")} />
      {children}
    </label>
  );
}

function Swatches({ value, onChange, section }) {
  return (
    <div role="radiogroup" aria-label={`${section} colour`} className="flex items-center gap-1.5">
      {Object.entries(EXPORT_COLORS).map(([key, tone]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={tone.label}
          title={tone.label}
          onClick={() => onChange(key)}
          className={cn(
            "size-3.5 rounded-full transition-shadow",
            value === key && "shadow-[0_0_0_2px_var(--color-sunken),0_0_0_3px_var(--color-ink-3)]",
          )}
          style={{ background: `#${tone.accent}` }}
        />
      ))}
    </div>
  );
}

function Label({ children, aside }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <p className="text-xs font-medium text-ink-2">{children}</p>
      {aside}
    </div>
  );
}

export function ExportDialog({ open, onOpenChange, companies, groups }) {
  const [prefs, setPrefs] = useStoredState("export-prefs", DEFAULT_PREFS);
  const [picked, setPicked] = useState(null);
  const [pending, start] = useTransition();

  const columns = prefs.columns ?? DEFAULT_EXPORT_COLUMNS;
  const colors = { ...DEFAULT_EXPORT_COLORS, ...prefs.colors };
  const update = (patch) => setPrefs((current) => ({ ...DEFAULT_PREFS, ...current, ...patch }));

  const options = useMemo(() => {
    const count = (id) =>
      companies.filter((company) => (company.groupId ?? NO_GROUP) === id && (prefs.includeArchived || !isArchived(company)))
        .length;
    return [...groups.map((group) => ({ id: group.id, name: group.name })), { id: NO_GROUP, name: "No group" }]
      .map((group) => ({ ...group, count: count(group.id) }))
      .filter((group) => group.count || group.id !== NO_GROUP);
  }, [companies, groups, prefs.includeArchived]);

  const selected = picked ?? options.map((group) => group.id);
  const allPicked = selected.length === options.length;
  const sections = pickColumns(columns);
  const companyCount = options.filter((group) => selected.includes(group.id)).reduce((sum, group) => sum + group.count, 0);
  const hasSecrets = columns.includes("providerPassword") || columns.includes("rdpKey");

  const toggleGroup = (id, on) =>
    setPicked(on ? [...selected, id] : selected.filter((item) => item !== id));
  const toggleColumn = (key, on) =>
    update({ columns: on ? [...columns, key] : columns.filter((item) => item !== key) });

  function run() {
    if (!selected.length) return toast.error("Pick at least one group.");
    if (!sections.length) return toast.error("Pick at least one column.");

    start(async () => {
      const result = await exportCompanies({ groupIds: selected, includeArchived: Boolean(prefs.includeArchived) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      try {
        const { buildPdf, buildXlsx, download } = await import("@/lib/export-files");
        const { sheets, today } = result.data;
        const name = sheets.length === 1 ? slug(sheets[0].name) : "all-groups";
        const pdf = prefs.format === "pdf";
        const blob = await (pdf ? buildPdf : buildXlsx)(result.data, sections, colors);
        download(blob, `life-tracker-${name}-${today}.${pdf ? "pdf" : "xlsx"}`);
        toast.success(`Exported ${plural(sheets.length, pdf ? "group" : "tab")}`);
        onOpenChange(false);
      } catch {
        toast.error("Could not build the file.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export"
      description="Dates, life left and credentials for each company, one tab or page per group"
      className="max-w-[64rem]"
      autoFocus={false}
    >
      <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Format" value={prefs.format} onChange={(format) => update({ format })} options={FORMATS} />
          <p className="text-xs text-ink-3">
            {prefs.format === "pdf" ? "Each group starts on its own page" : "Each group gets its own tab"}
          </p>
        </div>

        <div>
          <Label
            aside={
              <button
                type="button"
                onClick={() => setPicked(allPicked ? [] : null)}
                className="text-xs text-data hover:underline"
              >
                {allPicked ? "Clear" : "Select all"}
              </button>
            }
          >
            Groups
          </Label>
          <div className="flex flex-wrap gap-0.5 rounded-lg bg-hover p-0.5">
            {options.map((group) => (
              <Toggle key={group.id} checked={selected.includes(group.id)} onChange={(on) => toggleGroup(group.id, on)}>
                {group.name}
                <span className="text-2xs text-ink-4 tabular-nums">{group.count}</span>
              </Toggle>
            ))}
          </div>
        </div>

        <div>
          <Label
            aside={
              <button
                type="button"
                onClick={() => update({ columns: DEFAULT_EXPORT_COLUMNS, colors: DEFAULT_EXPORT_COLORS })}
                className="text-xs text-data hover:underline"
              >
                Reset
              </button>
            }
          >
            Columns and colours
          </Label>
          <div className="divide-y divide-grid rounded-xl bg-sunken">
            {EXPORT_SECTIONS.map((section) => {
              const tone = EXPORT_COLORS[colors[section.key]];
              return (
                <div key={section.key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
                  <div className="grid w-[15rem] shrink-0 gap-2 pt-1">
                    <span className="text-sm font-medium" style={{ color: `#${tone.accent}` }}>
                      {section.label}
                    </span>
                    <Swatches
                      section={section.label}
                      value={colors[section.key]}
                      onChange={(color) => update({ colors: { ...colors, [section.key]: color } })}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
                    {section.columns.map((column) => (
                      <Toggle
                        key={column.key}
                        checked={columns.includes(column.key)}
                        onChange={(on) => toggleColumn(column.key, on)}
                      >
                        {column.label}
                      </Toggle>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm text-ink-2">Include archived companies</span>
          <Switch
            checked={Boolean(prefs.includeArchived)}
            onCheckedChange={(includeArchived) => update({ includeArchived })}
          />
        </label>

        {hasSecrets && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            <ShieldAlert className="mt-px size-[1.4rem] shrink-0" />
            The file will hold passwords and RDP keys in plain text. Keep it somewhere safe.
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-ink-3">
          {plural(companyCount, "company", "companies")} · {plural(sections.reduce((sum, s) => sum + s.columns.length, 0), "column")}
        </span>
        <Button variant="soft" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={run} pending={pending} disabled={!selected.length || !sections.length}>
          Export {prefs.format === "pdf" ? "PDF" : "Excel"}
        </Button>
      </div>
    </Dialog>
  );
}
