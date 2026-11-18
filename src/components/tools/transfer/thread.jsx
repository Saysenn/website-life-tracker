"use client";

import {
  ArrowUp,
  Check,
  CheckCheck,
  CloudUpload,
  Copy,
  Download,
  Ellipsis,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Lock,
  ListChecks,
  Paperclip,
  RotateCw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { INLINE_TYPES, MAX_MESSAGE, PREVIEW_MAX_BYTES } from "@/lib/transfer/constants";
import { extensionOf, formatBytes } from "@/lib/tools/files";
import { cn } from "@/lib/utils";
import { ProgressBar } from "../drop-zone";
import { call } from "./api";
import { clock, dayLabel, duration } from "./format";
import { EMPTY_SEARCH, Highlight, SearchBar, SelectBar, Tick, matches, searchActive, termsOf } from "./thread-tools";
import { useChat } from "./use-chat";
import { useUploads } from "./use-uploads";

const ICONS = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  doc: FileText,
  file: File,
};

function kindOf({ name = "", type = "" }) {
  const ext = extensionOf(name);
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["pdf", "doc", "docx", "txt", "md", "rtf", "odt"].includes(ext)) return "doc";
  return "file";
}

export function FileGlyph({ file, className }) {
  const Icon = ICONS[kindOf(file)];
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-3", className)}
    >
      <Icon className="size-[1.8rem]" strokeWidth={1.5} />
    </span>
  );
}

const fileUrl = (id, inline) => `/api/transfer/files/${id}${inline ? "?inline=1" : ""}`;

function FileCard({ file, mine, terms, picking }) {
  if (file.status !== "ready") {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm",
          mine ? "bg-ink/80 text-ground/70" : "bg-sunken text-ink-3",
        )}
      >
        <File className="size-[1.6rem]" strokeWidth={1.5} />
        This file was removed
      </div>
    );
  }

  const preview = INLINE_TYPES.includes(file.type) && file.size <= PREVIEW_MAX_BYTES;
  return (
    <div
      className={cn(
        "w-[30rem] max-w-full overflow-hidden rounded-2xl",
        mine ? "bg-ink text-ground" : "bg-surface shadow-card",
        picking && "pointer-events-none",
      )}
    >
      {preview && (
        <a href={fileUrl(file.id, true)} target="_blank" rel="noreferrer" className="block bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(file.id, true)}
            alt={file.name}
            loading="lazy"
            className="max-h-[28rem] w-full object-cover"
          />
        </a>
      )}
      <div className="flex items-center gap-3 p-2.5">
        <FileGlyph file={file} className={mine ? "bg-ground/10 text-ground/80" : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            <Highlight text={file.name} terms={terms} />
          </p>
          <p className={cn("text-xs tabular-nums", mine ? "text-ground/60" : "text-ink-3")}>{formatBytes(file.size)}</p>
        </div>
        {!picking && (
          <Tooltip label="Download">
            <a
              href={fileUrl(file.id)}
              download={file.name}
              aria-label={`Download ${file.name}`}
              className={cn(
                "flex size-8.5 shrink-0 items-center justify-center rounded-lg transition-colors",
                mine ? "bg-ground/12 text-ground hover:bg-ground/22" : "bg-ink text-ground hover:bg-ink/85",
              )}
            >
              <Download className="size-[1.5rem]" />
            </a>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

const LONG_TEXT = 1500;

function TextBubble({ body, mine, terms }) {
  const [opened, setOpen] = useState(false);
  const long = body.length > LONG_TEXT;
  // A search hit past the cut would be invisible, so show the whole message while searching.
  const open = opened || Boolean(terms?.length);
  const copy = () =>
    navigator.clipboard.writeText(body).then(
      () => toast.success("Message copied"),
      () => toast.error("Could not copy"),
    );
  return (
    <div
      className={cn(
        "max-w-[min(52rem,85%)] rounded-2xl px-3.5 py-2 text-base break-words whitespace-pre-wrap",
        mine ? "rounded-br-md bg-ink text-ground" : "rounded-bl-md bg-surface text-ink shadow-card",
      )}
    >
      {long && !open ? `${body.slice(0, LONG_TEXT).trimEnd()}…` : <Highlight text={body} terms={terms} />}
      {long && (
        <div
          className={cn("mt-2 flex gap-1.5 border-t pt-2 whitespace-normal", mine ? "border-ground/15" : "border-grid")}
        >
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mine ? "hover:bg-ground/12" : "hover:bg-hover",
            )}
          >
            {open ? "Show less" : `Show all · ${body.length.toLocaleString()} characters`}
          </button>
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mine ? "hover:bg-ground/12" : "hover:bg-hover",
            )}
          >
            <Copy className="size-[1.2rem]" />
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

/** The ⋯ menu beside your own messages. Shows on hover, always on touch screens. */
function MessageMenu({ message, onUnsend }) {
  const copy = () =>
    navigator.clipboard.writeText(message.body).then(
      () => toast.success("Message copied"),
      () => toast.error("Could not copy"),
    );
  return (
    <Menu
      label="More"
      trigger={
        <button
          type="button"
          data-menu=""
          aria-label="Message options"
          className="flex size-7 shrink-0 items-center justify-center self-center rounded-md text-ink-4 opacity-0 transition-[opacity,background-color,color] duration-150 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100 aria-expanded:bg-hover aria-expanded:text-ink aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Ellipsis className="size-[1.5rem]" />
        </button>
      }
    >
      {message.body && (
        <MenuItem onSelect={copy}>
          <Copy />
          Copy
        </MenuItem>
      )}
      <MenuItem danger onSelect={() => onUnsend(message)}>
        <Undo2 />
        Unsend
      </MenuItem>
    </Menu>
  );
}

function Bubble({ message, mine, status, terms, dim, focused, picking, picked, onPick, onUnsend }) {
  const file = message.file;
  const pickable = picking && file?.status === "ready";
  const content = file ? (
    <FileCard file={file} mine={mine} terms={terms} picking={pickable} />
  ) : (
    <TextBubble body={message.body ?? "Message could not be read"} mine={mine} terms={terms} />
  );
  return (
    <div
      data-message={message.id}
      className={cn(
        "flex animate-rise flex-col gap-1 transition-opacity duration-200",
        mine ? "items-end" : "items-start",
        (dim || (picking && !pickable)) && "opacity-35",
      )}
    >
      {pickable ? (
        <div
          role="checkbox"
          aria-checked={picked}
          aria-label={`Select ${file.name}`}
          tabIndex={0}
          onClick={(event) => onPick(message.file.id, event.shiftKey)}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              onPick(message.file.id, event.shiftKey);
            }
          }}
          className={cn(
            "flex max-w-full cursor-pointer items-center gap-2.5 rounded-2xl outline-none select-none focus-visible:ring-2 focus-visible:ring-data",
            mine && "flex-row-reverse",
          )}
        >
          <Tick on={picked} />
          <div
            className={cn(
              "max-w-full rounded-2xl transition-[box-shadow,transform] duration-150",
              picked
                ? "scale-[0.98] ring-2 ring-data ring-offset-2 ring-offset-ground"
                : "hover:ring-2 hover:ring-grid",
            )}
          >
            {content}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "group flex w-full items-start gap-1 [&>*]:transition-shadow [&>*]:duration-300",
            mine ? "justify-end" : "justify-start",
            focused &&
              "[&>:not([data-menu])]:ring-2 [&>:not([data-menu])]:ring-warning [&>:not([data-menu])]:ring-offset-2 [&>:not([data-menu])]:ring-offset-ground",
          )}
        >
          {onUnsend && <MessageMenu message={message} onUnsend={onUnsend} />}
          {content}
        </div>
      )}
      <span className="flex items-center gap-1 px-1 text-2xs text-ink-4 tabular-nums">
        {clock(message.createdAt)}
        {status === "seen" && (
          <>
            <CheckCheck className="size-[1.2rem] text-data" />
            Seen
          </>
        )}
        {status === "sent" && <Check className="size-[1.2rem]" />}
      </span>
    </div>
  );
}

function UploadCard({ item, onCancel, onRetry }) {
  const progress = item.size ? item.loaded / item.size : item.status === "done" ? 1 : 0;
  const tone = item.status === "error" ? "danger" : item.status === "done" ? "success" : "data";
  return (
    <div className="flex animate-rise justify-end">
      <div className="w-[30rem] max-w-full rounded-2xl bg-surface p-3 shadow-card">
        <div className="flex items-center gap-3">
          <FileGlyph file={item} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.name}>
              {item.name}
            </p>
            <p className="text-xs text-ink-3 tabular-nums">
              {item.status === "queued" && `Waiting · ${formatBytes(item.size)}`}
              {item.status === "cleaning" && "Removing metadata…"}
              {item.status === "uploading" &&
                `${formatBytes(item.loaded)} of ${formatBytes(item.size)}${item.speed ? ` · ${formatBytes(item.speed)}/s · ${duration(item.eta)} left` : ""}`}
              {item.status === "done" && <span className="text-success">Sent</span>}
              {item.status === "error" && <span className="text-danger">{item.error}</span>}
            </p>
          </div>
          {item.status === "error" && (
            <Tooltip label="Try again">
              <button
                type="button"
                onClick={() => onRetry(item.key)}
                aria-label="Try again"
                className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <RotateCw className="size-[1.4rem]" />
              </button>
            </Tooltip>
          )}
          {item.status !== "done" && (
            <Tooltip label={item.status === "error" ? "Remove" : "Cancel"}>
              <button
                type="button"
                onClick={() => onCancel(item.key)}
                aria-label="Cancel upload"
                className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <X className="size-[1.5rem]" />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <ProgressBar value={progress} tone={tone} className="flex-1" />
          <span className="w-9 text-right text-2xs font-semibold text-ink-2 tabular-nums">
            {Math.floor(progress * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function IncomingCard({ file, peerName }) {
  return (
    <div className="flex animate-rise justify-start">
      <div className="w-[30rem] max-w-full rounded-2xl bg-surface p-3 shadow-card">
        <div className="flex items-center gap-3">
          <FileGlyph file={file} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-ink-3 tabular-nums">
              {peerName} is sending · {formatBytes(file.size * file.progress)} of {formatBytes(file.size)}
            </p>
          </div>
          <Spinner className="text-ink-3" />
        </div>
        <ProgressBar value={file.progress} tone="data" className="mt-2.5" />
      </div>
    </div>
  );
}

function Typing({ name }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-ink-3 animate-fade">
      <span className="flex gap-0.5 rounded-full bg-surface px-2.5 py-2 shadow-card">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1 animate-bounce rounded-full bg-ink-3"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
      </span>
      {name} is typing
    </div>
  );
}

function Composer({ disabled, disabledNote, onSend, onFiles, onTyping }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef(null);
  const picker = useRef(null);

  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [text]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setText("");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  if (disabled) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-3">
        <Lock className="size-[1.4rem]" />
        {disabledNote}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl bg-surface p-1.5 shadow-card focus-within:shadow-[0_0_0_3px_rgb(140_108_70/0.14)]">
      <Tooltip label="Attach files">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label="Attach files"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          <Paperclip className="size-[1.7rem]" strokeWidth={1.75} />
        </button>
      </Tooltip>
      <input
        ref={picker}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <textarea
        ref={input}
        rows={1}
        value={text}
        maxLength={MAX_MESSAGE}
        placeholder="Write a message"
        onChange={(event) => {
          setText(event.target.value);
          onTyping();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        onPaste={(event) => {
          if (event.clipboardData.files.length) {
            event.preventDefault();
            onFiles(event.clipboardData.files);
          }
        }}
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-snug outline-none placeholder:text-ink-4"
      />
      <Tooltip label="Send">
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || sending}
          aria-label="Send message"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-ground transition-[background-color,opacity] hover:bg-ink/85 disabled:opacity-30"
        >
          {sending ? <Spinner /> : <ArrowUp className="size-[1.7rem]" strokeWidth={2.25} />}
        </button>
      </Tooltip>
    </div>
  );
}

const ZIP_LIMIT = 4 * 1024 ** 3 - 64 * 1024 ** 2;

/** Search and select buttons, placed in each page's own header. */
function ThreadButtons({ searching, picking, canPick, onSearch, onPick }) {
  return (
    <>
      <Tooltip label={searching ? "Close search" : "Search this chat (Ctrl+F)"}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          aria-label="Search this chat"
          aria-pressed={searching}
          className={cn(searching && "bg-hover text-ink")}
        >
          <Search />
        </Button>
      </Tooltip>
      {canPick && (
        <Tooltip label={picking ? "Stop selecting" : "Select files to download"}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPick}
            aria-label="Select files"
            aria-pressed={picking}
            className={cn(picking && "bg-hover text-ink")}
          >
            <ListChecks />
          </Button>
        </Tooltip>
      )}
    </>
  );
}

/**
 * The conversation itself, shared by the admin page and the guest page.
 * `role` is who is looking: "admin" or "guest".
 */
export function Thread({
  role,
  syncUrl,
  messagesUrl,
  filesUrl,
  zipUrl,
  peerName,
  renderHeader,
  renderEnded,
  initialFiles,
  onPeerMessages,
  onPeerUnsent,
  empty,
}) {
  const chat = useChat(syncUrl, { role, onPeerMessages, onPeerUnsent });
  const uploads = useUploads({
    onSent: chat.addMessage,
    onError: (error) => toast.error(error.message),
  });
  const scroller = useRef(null);
  const pinned = useRef(true);
  const [dragging, setDragging] = useState(false);
  const seeded = useRef(false);
  const { add } = uploads;

  // Search: null while closed.
  const [search, setSearch] = useState(null);
  const [jumpedTo, setJumpedTo] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const searchBox = useRef(null);
  // Picking files to download together: null while off.
  const [picked, setPicked] = useState(null);
  const anchor = useRef(null);

  const terms = useMemo(() => termsOf(search?.query ?? ""), [search?.query]);
  const active = searchActive(search, terms);
  const results = useMemo(
    () => (active ? chat.messages.filter((message) => matches(message, search, terms, role)) : []),
    [active, chat.messages, search, terms, role],
  );
  const resultIds = useMemo(() => new Set(results.map((message) => message.id)), [results]);
  const currentId = resultIds.has(jumpedTo) ? jumpedTo : (results.at(-1)?.id ?? null);

  // Files that can be downloaded right now, oldest first.
  const allReady = useMemo(
    () =>
      chat.messages
        .filter((message) => message.file && chat.files[message.file.id] === "ready")
        .map((message) => message.file),
    [chat.messages, chat.files],
  );
  // "Select all" and shift-click ranges stick to search hits while searching.
  const readyFiles = useMemo(
    () => (active ? allReady.filter((file) => results.some((message) => message.file?.id === file.id)) : allReady),
    [active, allReady, results],
  );

  useEffect(() => {
    if (!active || currentId == null) return;
    const node = scroller.current?.querySelector(`[data-message="${currentId}"]`);
    if (!node) return;
    pinned.current = false;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, currentId]);

  const openSearch = () => {
    setSearch((current) => current ?? EMPTY_SEARCH);
    searchBox.current?.querySelector("input")?.focus();
  };
  const closeSearch = () => {
    setSearch(null);
    setJumpedTo(null);
    setListOpen(false);
  };
  const changeSearch = (next) => {
    setSearch(next);
    setJumpedTo(null);
  };

  const togglePicking = () => setPicked((current) => (current ? null : new Set()));
  const pick = (id, range) => {
    setPicked((current) => {
      const next = new Set(current);
      const order = readyFiles.map((file) => file.id);
      const from = order.indexOf(anchor.current);
      const to = order.indexOf(id);
      if (range && from !== -1 && to !== -1) {
        const turnOn = !current.has(id);
        order
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .forEach((each) => (turnOn ? next.add(each) : next.delete(each)));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  };

  const pickedFiles = picked ? allReady.filter((file) => picked.has(file.id)) : [];
  const pickedBytes = pickedFiles.reduce((sum, file) => sum + file.size, 0);
  const downloadPicked = () => {
    if (!pickedFiles.length) return;
    if (pickedBytes > ZIP_LIMIT && pickedFiles.length > 1) {
      toast.error("That is over 4 GB", {
        description: "Pick fewer files, or download the big ones one by one.",
      });
      return;
    }
    const single = pickedFiles.length === 1;
    const link = document.createElement("a");
    link.href = single
      ? fileUrl(pickedFiles[0].id)
      : `${zipUrl}${zipUrl.includes("?") ? "&" : "?"}ids=${pickedFiles.map((file) => file.id).join(",")}`;
    link.download = single ? pickedFiles[0].name : "";
    document.body.append(link);
    link.click();
    link.remove();
    toast.success(single ? `Downloading ${pickedFiles[0].name}` : `Downloading ${pickedFiles.length} files as a zip`, {
      description: formatBytes(pickedBytes),
    });
    setPicked(null);
  };

  // Ctrl/Cmd+F searches the chat, Esc backs out of picking.
  const keys = useRef({});
  useEffect(() => {
    keys.current = {
      openSearch,
      picking: Boolean(picked),
      stopPicking: () => setPicked(null),
    };
  });
  useEffect(() => {
    const onKey = (event) => {
      if (document.querySelector("[role='dialog']")) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        keys.current.openSearch();
      } else if (event.key === "Escape" && keys.current.picking && !event.defaultPrevented) {
        event.preventDefault();
        keys.current.stopPicking();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (seeded.current || !initialFiles?.length) return;
    seeded.current = true;
    add(initialFiles, filesUrl);
  }, [add, initialFiles, filesUrl]);

  const contentKey = `${chat.messages.length}-${uploads.items.length}-${chat.incoming.length}-${chat.peer?.typing}`;
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [contentKey]);

  if (chat.ended) return renderEnded?.(chat.ended) ?? null;

  const blocked = chat.chat?.blocked;
  const canSend = !(blocked && role === "guest");
  const sendFiles = (files) => {
    if (!canSend || !files?.length) return;
    pinned.current = true;
    add(files, filesUrl);
  };

  const sendText = async (body) => {
    pinned.current = true;
    const message = await call(messagesUrl, { body: { body } });
    chat.addMessage(message);
  };

  // Gone from the screen at once; put back only if the server refuses.
  const unsend = async (message) => {
    const restore = chat.removeMessage(message.id);
    try {
      await call(messagesUrl, { method: "DELETE", body: { id: message.id } });
    } catch (error) {
      if (error.status === 404) return;
      restore();
      toast.error(error.message);
    }
  };

  const lastMine = chat.messages.findLast((message) => message.sender === role);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        if (!canSend || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        sendFiles(event.dataTransfer.files);
      }}
    >
      {renderHeader?.({
        chat: chat.chat,
        peer: chat.peer,
        files: chat.files,
        tools: (
          <ThreadButtons
            searching={Boolean(search)}
            picking={Boolean(picked)}
            canPick={allReady.length > 0}
            onSearch={() => (search ? closeSearch() : openSearch())}
            onPick={togglePicking}
          />
        ),
      })}

      {search && (
        <div ref={searchBox}>
          <SearchBar
            search={search}
            onChange={changeSearch}
            onClose={closeSearch}
            results={results}
            currentId={currentId}
            onJump={(id, fromList) => {
              setJumpedTo(id);
              if (fromList && window.matchMedia("(max-width: 640px)").matches) setListOpen(false);
            }}
            listOpen={listOpen}
            onToggleList={() => setListOpen((value) => !value)}
            role={role}
            peerName={peerName}
            terms={terms}
            active={active}
          />
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {!chat.loaded ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-[2rem] text-ink-3" />
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-3">
            {!chat.messages.length && !uploads.items.length && !chat.incoming.length && empty}
            {chat.messages.map((message, index) => {
              const previous = chat.messages[index - 1];
              const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
              const mine = message.sender === role;
              const status = message.id === lastMine?.id ? (chat.peer?.readId >= message.id ? "seen" : "sent") : null;
              const live = message.file
                ? {
                    ...message,
                    file: {
                      ...message.file,
                      status: chat.files[message.file.id] ?? "removed",
                    },
                  }
                : message;
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <p className="my-1 text-center text-2xs font-medium text-ink-4">{dayLabel(message.createdAt)}</p>
                  )}
                  <Bubble
                    message={live}
                    mine={mine}
                    status={status}
                    terms={active && resultIds.has(message.id) ? terms : null}
                    dim={active && !resultIds.has(message.id)}
                    focused={active && message.id === currentId}
                    picking={Boolean(picked)}
                    picked={Boolean(picked?.has(message.file?.id))}
                    onPick={pick}
                    onUnsend={mine && canSend ? unsend : null}
                  />
                </Fragment>
              );
            })}
            {chat.incoming.map((file) => (
              <IncomingCard key={file.id} file={file} peerName={peerName} />
            ))}
            {uploads.items.map((item) => (
              <UploadCard key={item.key} item={item} onCancel={uploads.cancel} onRetry={uploads.retry} />
            ))}
            {chat.peer?.typing && <Typing name={peerName} />}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pt-1 pb-3 sm:px-5 sm:pb-4">
        {picked ? (
          <SelectBar
            picked={pickedFiles.length}
            bytes={pickedBytes}
            total={readyFiles.length}
            allPicked={readyFiles.length > 0 && readyFiles.every((file) => picked.has(file.id))}
            matchedOnly={active}
            onAll={() => setPicked((current) => new Set([...current, ...readyFiles.map((file) => file.id)]))}
            onNone={() =>
              setPicked((current) => new Set([...current].filter((id) => !readyFiles.some((file) => file.id === id))))
            }
            onDownload={downloadPicked}
            onClose={() => setPicked(null)}
          />
        ) : (
          <Composer
            disabled={!canSend}
            disabledNote="This chat was closed. You can still download what was shared."
            onSend={sendText}
            onFiles={sendFiles}
            onTyping={chat.markTyping}
          />
        )}
        {blocked && role === "admin" && (
          <p className="mt-1.5 text-center text-2xs text-ink-3">
            Closed. {peerName} can read the chat but can no longer send anything.
          </p>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-data bg-data-soft/90 text-data animate-fade">
          <CloudUpload className="size-[3rem]" strokeWidth={1.5} />
          <p className="mt-2 text-base font-semibold">Drop to send</p>
          <p className="text-xs">Any file type, up to 2 GB each</p>
        </div>
      )}
    </div>
  );
}
