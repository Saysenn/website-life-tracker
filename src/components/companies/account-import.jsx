"use client";

import { CircleCheck, FileText, Upload } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { importAccounts } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { matchExisting, parseAccounts } from "@/lib/accounts";
import { cn, plural } from "@/lib/utils";

const SAMPLE = `Milkman
Acme Trading
acme@inbox.eu
sup3rsecret

Bright Path
bright@inbox.eu
anotherpass`;

const headClass = "px-2 py-1.5 text-left text-2xs font-medium text-ink-3";
const cellClass = "px-2 py-2 align-middle";

export function AccountImport({ companies, groups }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [saving, startSaving] = useTransition();

  const groupNames = useMemo(() => groups.map((group) => group.name), [groups]);

  function review(value) {
    setText(value);
    const parsed = matchExisting(parseAccounts(value, groupNames), companies);
    setRows(
      parsed.map((row) => ({
        ...row,
        group: row.group || row.existingGroup || "",
        include: !row.duplicateOf,
      })),
    );
  }

  function update(index, patch) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) review(await file.text());
  }

  function save() {
    const picked = rows.filter((row) => row.include && row.name);
    if (!picked.length) {
      toast.error("Tick at least one row first.");
      return;
    }

    startSaving(async () => {
      const result = await importAccounts(
        picked.map((row) => ({
          id: row.existingId,
          name: row.name,
          group: row.group,
          account: row.account,
          password: row.password,
        })),
      );
      if (result.ok) {
        const { created, updated } = result.data;
        toast.success(`${plural(created, "company", "companies")} added, ${updated} updated`);
        setText("");
        setRows([]);
      } else {
        toast.error(result.error);
      }
    });
  }

  const included = rows.filter((row) => row.include).length;
  const newCount = rows.filter((row) => row.include && !row.existingId).length;

  return (
    <Page>
      <PageHeader title="Import accounts" description="Paste a list or drop a file, then check it before it saves" />

      <div
        className="mt-5 grid gap-4"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Card
          title="Your list"
          description="One company per block, with the account email and password on their own lines"
          actions={
            text ? (
              <Button
                variant="soft"
                onClick={() => {
                  setText("");
                  setRows([]);
                }}
              >
                Clear
              </Button>
            ) : null
          }
        >
          <textarea
            value={text}
            onChange={(event) => review(event.target.value)}
            placeholder={SAMPLE}
            spellCheck={false}
            className={cn(
              "min-h-[20rem] w-full resize-y rounded-xl bg-sunken p-3 font-mono text-xs leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-4",
              dragging && "bg-selected",
            )}
          />
          <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-4">
            <Upload className="size-[1.3rem]" />
            Drop a txt file anywhere on this page
          </p>
        </Card>

        {rows.length > 0 && (
          <Card
            title="Review"
            description={`${plural(rows.length, "row")} found, ${newCount} new and ${included - newCount} already tracked`}
            actions={
              <Button onClick={save} pending={saving} disabled={!included}>
                Import {included}
              </Button>
            }
            className="animate-rise"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className={cn(headClass, "w-[3rem]")} />
                    <th className={headClass}>Company</th>
                    <th className={cn(headClass, "w-[16rem]")}>Group</th>
                    <th className={cn(headClass, "w-[18rem]")}>Account email</th>
                    <th className={cn(headClass, "w-[16rem]")}>Password</th>
                    <th className={cn(headClass, "w-[10rem]")}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.name}-${index}`} className={cn(!row.include && "opacity-50")}>
                      <td className={cellClass}>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(event) => update(index, { include: event.target.checked })}
                          aria-label={`Include ${row.name}`}
                          className="size-4 accent-ink"
                        />
                      </td>
                      <td className={cellClass}>
                        <Input
                          value={row.name}
                          onChange={(event) => update(index, { name: event.target.value })}
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className={cellClass}>
                        <Combobox
                          value={row.group}
                          onChange={(value) => update(index, { group: value })}
                          options={groupNames}
                          placeholder="No group"
                        />
                      </td>
                      <td className={cellClass}>
                        <Input
                          value={row.account}
                          onChange={(event) => update(index, { account: event.target.value })}
                          placeholder="None"
                          className="h-7 text-sm"
                        />
                      </td>
                      <td className={cellClass}>
                        <Input
                          value={row.password}
                          onChange={(event) => update(index, { password: event.target.value })}
                          placeholder="None"
                          spellCheck={false}
                          autoComplete="off"
                          className="h-7 font-mono text-sm"
                        />
                      </td>
                      <td className={cellClass}>
                        {row.duplicateOf ? (
                          <span className="text-warning">Repeat of {row.duplicateOf}</span>
                        ) : row.existingId ? (
                          <span className="text-ink-3">Updates existing</span>
                        ) : (
                          <span className="text-success">Adds new</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {!rows.length && text.trim() && (
          <Card>
            <div className="flex flex-col items-center py-10 text-center">
              <FileText className="size-[2.2rem] text-ink-4" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">Nothing recognised yet</p>
              <p className="mt-0.5 max-w-[40rem] text-xs text-ink-3">
                Keep one company per block, separated by a blank line, with the email and password on their own lines.
              </p>
            </div>
          </Card>
        )}

        {!text.trim() && (
          <Card>
            <div className="flex flex-col items-center py-10 text-center">
              <CircleCheck className="size-[2.2rem] text-success" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">Nothing saves until you press Import</p>
              <p className="mt-0.5 max-w-[42rem] text-xs text-ink-3">
                Group headings carry down to the blocks beneath them, companies you already track are updated instead of
                duplicated, and passwords are encrypted before they are stored.
              </p>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}
