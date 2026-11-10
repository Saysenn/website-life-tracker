"use client";

import {
  ArrowUp,
  Check,
  CheckCheck,
  CloudUpload,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Lock,
  Paperclip,
  RotateCw,
  X,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { INLINE_TYPES, MAX_MESSAGE, PREVIEW_MAX_BYTES } from "@/lib/transfer/constants";
import { extensionOf, formatBytes } from "@/lib/tools/files";
import { cn } from "@/lib/utils";
import { ProgressBar } from "../drop-zone";
import { call } from "./api";
import { clock, dayLabel, duration } from "./format";
import { useChat } from "./use-chat";
import { useUploads } from "./use-uploads";

const ICONS = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, doc: FileText, file: File };

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
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-3", className)}>
      <Icon className="size-[1.8rem]" strokeWidth={1.5} />
    </span>
  );
}

const fileUrl = (id, inline) => `/api/transfer/files/${id}${inline ? "?inline=1" : ""}`;

function FileCard({ file, mine }) {
  if (file.status !== "ready") {
    return (
      <div className={cn("flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm", mine ? "bg-ink/80 text-ground/70" : "bg-sunken text-ink-3")}>
        <File className="size-[1.6rem]" strokeWidth={1.5} />
        This file was removed
      </div>
    );
  }

  const preview = INLINE_TYPES.includes(file.type) && file.size <= PREVIEW_MAX_BYTES;
  return (
    <div className={cn("w-[30rem] max-w-full overflow-hidden rounded-2xl", mine ? "bg-ink text-ground" : "bg-surface shadow-card")}>
      {preview && (
        <a href={fileUrl(file.id, true)} target="_blank" rel="noreferrer" className="block bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(file.id, true)} alt={file.name} loading="lazy" className="max-h-[28rem] w-full object-cover" />
        </a>
      )}
      <div className="flex items-center gap-3 p-2.5">
        <FileGlyph file={file} className={mine ? "bg-ground/10 text-ground/80" : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className={cn("text-xs tabular-nums", mine ? "text-ground/60" : "text-ink-3")}>{formatBytes(file.size)}</p>
        </div>
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
      </div>
    </div>
  );
}

function Bubble({ message, mine, status }) {
  const file = message.file;
  return (
    <div className={cn("flex animate-rise flex-col gap-1", mine ? "items-end" : "items-start")}>
      {file ? (
        <FileCard file={file} mine={mine} />
      ) : (
        <div
          className={cn(
            "max-w-[min(52rem,85%)] rounded-2xl px-3.5 py-2 text-base break-words whitespace-pre-wrap",
            mine ? "rounded-br-md bg-ink text-ground" : "rounded-bl-md bg-surface text-ink shadow-card",
          )}
        >
          {message.body ?? "Message could not be read"}
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
          <span className="w-9 text-right text-2xs font-semibold text-ink-2 tabular-nums">{Math.floor(progress * 100)}%</span>
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
          <span key={dot} className="size-1 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${dot * 120}ms` }} />
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

/**
 * The conversation itself, shared by the admin page and the guest page.
 * `role` is who is looking: "admin" or "guest".
 */
export function Thread({
  role,
  syncUrl,
  messagesUrl,
  filesUrl,
  peerName,
  renderHeader,
  renderEnded,
  initialFiles,
  onPeerMessages,
  empty,
}) {
  const chat = useChat(syncUrl, { role, onPeerMessages });
  const uploads = useUploads({
    onSent: chat.addMessage,
    onError: (error) => toast.error(error.message),
  });
  const scroller = useRef(null);
  const pinned = useRef(true);
  const [dragging, setDragging] = useState(false);
  const seeded = useRef(false);
  const { add } = uploads;

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
      {renderHeader?.({ chat: chat.chat, peer: chat.peer, files: chat.files })}

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
              const status =
                message.id === lastMine?.id ? (chat.peer?.readId >= message.id ? "seen" : "sent") : null;
              const live = message.file ? { ...message, file: { ...message.file, status: chat.files[message.file.id] ?? "removed" } } : message;
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <p className="my-1 text-center text-2xs font-medium text-ink-4">{dayLabel(message.createdAt)}</p>
                  )}
                  <Bubble message={live} mine={mine} status={status} />
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
        <Composer
          disabled={!canSend}
          disabledNote="This chat was closed. You can still download what was shared."
          onSend={sendText}
          onFiles={sendFiles}
          onTyping={chat.markTyping}
        />
        {blocked && role === "admin" && (
          <p className="mt-1.5 text-center text-2xs text-ink-3">Closed. {peerName} can read the chat but can no longer send anything.</p>
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
