"use client";

import { Check, ChevronDown, ChevronUp, CheckSquare, Download, List, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { formatBytes } from "@/lib/tools/files";
import { cn, plural } from "@/lib/utils";
import { clock, dayLabel } from "./format";

export const EMPTY_SEARCH = { query: "", kind: "all", who: "anyone" };

const KINDS = [
  { value: "all", label: "All" },
  { value: "text", label: "Messages" },
  { value: "file", label: "Files" },
  { value: "media", label: "Photos & videos" },
  { value: "doc", label: "Documents" },
];

const MEDIA = /^(image|video)\//;
const DOC = /\.(pdf|docx?|xlsx?|csv|pptx?|txt|md|rtf|odt|ods|odp|pages|numbers|key)$/i;

/** Lowercase, accents stripped, so "cafe" finds "Café". */
export const fold = (text = "") => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Words of the query. Every word has to appear somewhere, in any order. */
export function termsOf(query) {
  return fold(query).trim().split(/\s+/).filter(Boolean);
}

export const searchActive = (search, terms) =>
  Boolean(search) && (terms.length > 0 || search.kind !== "all" || search.who !== "anyone");

const textOf = (message) => (message.file ? message.file.name : (message.body ?? ""));

export function matches(message, search, terms, role) {
  const file = message.file;
  if (search.who === "me" && message.sender !== role) return false;
  if (search.who === "them" && message.sender === role) return false;
  if (search.kind === "text" && file) return false;
  if (search.kind === "file" && !file) return false;
  if (search.kind === "media" && !(file && MEDIA.test(file.type ?? ""))) return false;
  if (search.kind === "doc" && !(file && DOC.test(file.name ?? ""))) return false;
  if (!terms.length) return true;
  const haystack = fold(textOf(message));
  return terms.every((term) => haystack.includes(term));
}

/**
 * Wraps every hit of the search words in <mark>. Works on folded text so
 * accents and case do not matter, then maps back to the original characters.
 */
export function Highlight({ text, terms }) {
  if (!terms?.length || !text) return text;
  const folded = fold(text);
  // Folding can change length (é → e + accent, removed), so only highlight when it did not.
  if (folded.length !== text.length) return text;
  const ranges = [];
  terms.forEach((term) => {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      ranges.push([at, at + term.length]);
    }
  });
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(([start, end]) => {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });
  const parts = [];
  let cursor = 0;
  merged.forEach(([start, end]) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="rounded-[3px] bg-warning/45 px-px text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** A short piece of text around the first hit, for the results list. */
function snippet(text, terms) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!terms.length) return clean.slice(0, 120);
  const at = fold(clean).indexOf(terms[0]);
  if (at < 50) return clean.slice(0, 120) + (clean.length > 120 ? "…" : "");
  return `…${clean.slice(at - 40, at + 80)}${clean.length > at + 80 ? "…" : ""}`;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-6 shrink-0 rounded-full px-2.5 text-2xs font-medium transition-colors",
        active ? "bg-ink text-ground" : "bg-sunken text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** The search bar under the chat header: words, filters, older/newer and a results list. */
export function SearchBar({
  search,
  onChange,
  onClose,
  results,
  currentId,
  onJump,
  listOpen,
  onToggleList,
  role,
  peerName,
  terms,
  active,
}) {
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);

  const index = results.findIndex((message) => message.id === currentId);
  const count = results.length;
  const step = (direction) => {
    if (!count) return;
    const next = index === -1 ? count - 1 : (index + direction + count) % count;
    onJump(results[next].id);
  };
  const set = (patch) => onChange({ ...search, ...patch });

  return (
    <div className="shrink-0 border-b border-grid bg-surface animate-fade">
      <div className="flex items-center gap-1.5 px-3 pt-2.5 sm:px-5">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-sunken px-2.5 focus-within:shadow-[0_0_0_3px_rgb(140_108_70/0.14)]">
          <Search className="size-[1.5rem] shrink-0 text-ink-3" />
          <input
            ref={input}
            value={search.query}
            onChange={(event) => set({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                step(event.shiftKey ? 1 : -1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                step(-1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                step(1);
              }
            }}
            placeholder="Search messages and file names"
            aria-label="Search this chat"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
          />
          {active && (
            <span className="shrink-0 text-2xs text-ink-3 tabular-nums">
              {count ? `${count - index > count ? 1 : count - index} of ${count}` : "No results"}
            </span>
          )}
          {search.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                set({ query: "" });
                input.current?.focus();
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X className="size-[1.2rem]" />
            </button>
          )}
        </div>
        <Tooltip label="Older match (Enter)">
          <Button variant="ghost" size="icon" onClick={() => step(-1)} disabled={!count} aria-label="Older match">
            <ChevronUp />
          </Button>
        </Tooltip>
        <Tooltip label="Newer match (Shift+Enter)">
          <Button variant="ghost" size="icon" onClick={() => step(1)} disabled={!count} aria-label="Newer match">
            <ChevronDown />
          </Button>
        </Tooltip>
        <Tooltip label={listOpen ? "Hide results list" : "Show all results"}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleList}
            aria-pressed={listOpen}
            aria-label="Results list"
            className={cn(listOpen && "bg-hover text-ink")}
          >
            <List />
          </Button>
        </Tooltip>
        <Tooltip label="Close search (Esc)">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
            <X />
          </Button>
        </Tooltip>
      </div>

      <div className="flex gap-1 overflow-x-auto px-3 py-2 sm:px-5 [scrollbar-width:none]">
        {KINDS.map((kind) => (
          <Chip key={kind.value} active={search.kind === kind.value} onClick={() => set({ kind: kind.value })}>
            {kind.label}
          </Chip>
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-grid" />
        {[
          { value: "anyone", label: "Anyone" },
          { value: "me", label: "From you" },
          { value: "them", label: `From ${peerName}` },
        ].map((who) => (
          <Chip key={who.value} active={search.who === who.value} onClick={() => set({ who: who.value })}>
            {who.label}
          </Chip>
        ))}
      </div>

      {listOpen && (
        <div className="max-h-[min(32rem,40dvh)] overflow-y-auto border-t border-grid">
          {!active ? (
            <p className="px-5 py-6 text-center text-xs text-ink-3">
              Type a word or pick a filter to see results here.
            </p>
          ) : !count ? (
            <p className="px-5 py-6 text-center text-xs text-ink-3">Nothing in this chat matches.</p>
          ) : (
            <ul className="grid p-1.5">
              {results
                .slice()
                .reverse()
                .map((message) => {
                  const file = message.file;
                  const text = file ? file.name : (message.body ?? "");
                  return (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => onJump(message.id, true)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sunken",
                          message.id === currentId && "bg-selected hover:bg-selected",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline gap-2 text-2xs text-ink-3">
                            <span className="font-semibold text-ink-2">
                              {message.sender === role ? "You" : peerName}
                            </span>
                            {file && <span>· File{file.size ? ` · ${formatBytes(file.size)}` : ""}</span>}
                            <span className="ml-auto shrink-0 tabular-nums">
                              {dayLabel(message.createdAt)} · {clock(message.createdAt)}
                            </span>
                          </p>
                          <p className={cn("mt-0.5 line-clamp-2 text-sm break-words", file && "font-medium")}>
                            <Highlight text={snippet(text, terms)} terms={terms} />
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Takes the composer's place while picking files. */
export function SelectBar({ picked: count, bytes, total, allPicked, matchedOnly, onAll, onNone, onDownload, onClose }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface p-1.5 shadow-card animate-fade">
      <Tooltip label="Stop selecting (Esc)">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stop selecting">
          <X />
        </Button>
      </Tooltip>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {count ? `${plural(count, "file")} selected` : "Tap files to select them"}
        </p>
        <p className="truncate text-2xs text-ink-3 tabular-nums">
          {count
            ? formatBytes(bytes)
            : `Shift-click to pick a range · ${plural(total, matchedOnly ? "match" : "file", matchedOnly ? "matches" : undefined)}`}
        </p>
      </div>
      <Button variant="soft" size="md" onClick={allPicked ? onNone : onAll} disabled={!total}>
        <CheckSquare />
        <span className="hidden sm:inline">{allPicked ? "Clear" : matchedOnly ? "Select matches" : "Select all"}</span>
      </Button>
      <Button onClick={onDownload} disabled={!count}>
        <Download />
        Download{count > 1 ? ` ${count}` : ""}
      </Button>
    </div>
  );
}

/** The round tick shown next to each file while selecting. */
export function Tick({ on }) {
  return (
    <span
      className={cn(
        "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        on ? "border-data bg-data text-white" : "border-ink-4 bg-surface",
      )}
    >
      {on && <Check className="size-[1.2rem]" strokeWidth={3} />}
    </span>
  );
}
