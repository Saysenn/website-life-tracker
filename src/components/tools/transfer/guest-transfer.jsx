"use client";

import { ArrowRight, Lock, MessageSquare, ShieldCheck, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { HOST_NAME, MAX_FILE_BYTES, MAX_NAME } from "@/lib/transfer/constants";
import { formatBytes } from "@/lib/tools/files";
import { cn, plural } from "@/lib/utils";
import { DropZone } from "../drop-zone";
import { chime } from "./alerts";
import { call } from "./api";
import { countdown, timeAgo, useNow } from "./format";
import { FileGlyph, Thread } from "./thread";

function Promises({ className }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-3", className)}>
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="size-[1.3rem] text-success" />
        Encrypted in storage
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Timer className="size-[1.3rem]" />
        Deleted after 24 hours
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Lock className="size-[1.3rem]" />
        Private to this chat
      </span>
    </div>
  );
}

function Start({ linkKey, onStarted }) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const addFiles = (list) => {
    const picked = Array.from(list);
    const tooBig = picked.filter((file) => file.size > MAX_FILE_BYTES);
    if (tooBig.length) toast.error(`${plural(tooBig.length, "file")} over 2 GB left out`);
    setFiles((current) => [...current, ...picked.filter((file) => file.size <= MAX_FILE_BYTES)]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError("Tell us your name first.");
    setPending(true);
    setError("");
    try {
      await call("/api/transfer/guest/start", { body: { key: linkKey, name } });
      onStarted(files);
    } catch (failure) {
      setError(failure.message);
      setPending(false);
    }
  };

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[52rem] animate-rise">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink text-ground shadow-card">
            <ArrowRight className="size-[2rem] -rotate-45" strokeWidth={2} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Send files securely</h1>
          <p className="mx-auto mt-1 max-w-[38rem] text-sm text-ink-3">
            Any file type, up to 2 GB each. You can chat while they upload and receive files back.
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
          <label htmlFor="guest-name" className="text-xs font-medium text-ink-2">
            Your name
          </label>
          <Input
            id="guest-name"
            value={name}
            maxLength={MAX_NAME}
            autoComplete="name"
            autoFocus
            placeholder="So they know who is sending"
            aria-invalid={Boolean(error) || undefined}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5"
          />

          <DropZone
            onFiles={addFiles}
            title="Choose files"
            hint="or drop them here"
            note="Optional. You can also add files once the chat opens."
            compact={files.length > 0}
            className={files.length ? "mt-4" : "mt-4 py-8 sm:py-10"}
          />

          {files.length > 0 && (
            <ul className="mt-2.5 grid max-h-[26rem] gap-1.5 overflow-y-auto">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex animate-rise items-center gap-2.5 rounded-xl bg-sunken p-2">
                  <FileGlyph file={file} className="size-8 bg-surface" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-ink-3 tabular-nums">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}
                    className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X className="size-[1.4rem]" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <Button type="submit" pending={pending} className="mt-4 h-10 w-full rounded-xl text-base">
            {files.length ? `Send ${plural(files.length, "file")} · ${formatBytes(total)}` : "Start chat"}
            {!pending && <ArrowRight />}
          </Button>
        </form>

        <Promises className="mt-5" />
      </div>
    </main>
  );
}

function GuestHeader({ chat, peer }) {
  const now = useNow();
  const status = peer?.typing ? "Typing…" : peer?.online ? "Online now" : peer?.seenAt ? `Seen ${timeAgo(peer.seenAt, now)}` : "Away";
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-grid px-4 py-3 sm:px-5">
      <span className="relative flex size-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ground">
        {HOST_NAME[0]}
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-surface",
            peer?.online ? "bg-good" : "bg-ink-4",
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-tight">{HOST_NAME}</p>
        <p className={cn("text-xs", peer?.online || peer?.typing ? "text-success" : "text-ink-3")}>
          {status}
          {!peer?.online && " · they get notified"}
        </p>
      </div>
      {chat && (
        <span className="hidden items-center gap-1 rounded-md bg-sunken px-2 py-1 text-2xs text-ink-2 sm:inline-flex">
          <Timer className="size-[1.2rem]" />
          Deletes in {countdown(chat.expiresAt - now)}
        </span>
      )}
    </div>
  );
}

function useUnreadTitle() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const clear = () => !document.hidden && setUnread(0);
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  useEffect(() => {
    document.title = unread ? `(${unread}) New message` : "Send files";
  }, [unread]);
  return setUnread;
}

export function GuestTransfer({ linkKey, started: startedBefore }) {
  const [started, setStarted] = useState(startedBefore);
  const [initialFiles, setInitialFiles] = useState(null);
  const setUnread = useUnreadTitle();

  if (!started) {
    return (
      <Start
        linkKey={linkKey}
        onStarted={(files) => {
          setInitialFiles(files);
          setStarted(true);
        }}
      />
    );
  }

  return (
    <main className="flex h-dvh justify-center p-0 sm:p-4">
      <div className="flex h-full w-full max-w-[76rem] flex-col">
        <div className="min-h-0 flex-1 overflow-hidden bg-surface sm:rounded-2xl sm:shadow-card">
          <Thread
            role="guest"
            syncUrl="/api/transfer/guest/sync"
            messagesUrl="/api/transfer/guest/messages"
            filesUrl="/api/transfer/guest/files"
            peerName={HOST_NAME}
            initialFiles={initialFiles}
            onPeerMessages={(messages) => {
              if (!document.hidden) return;
              chime();
              setUnread((count) => count + messages.length);
            }}
            renderHeader={(state) => <GuestHeader {...state} />}
            renderEnded={(message) => (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <MessageSquare className="size-[2.4rem] text-ink-4" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium">This chat has ended</p>
                <p className="mt-0.5 max-w-[34rem] text-xs text-ink-3">{message}</p>
                <Button variant="soft" size="sm" className="mt-4" onClick={() => window.location.reload()}>
                  Start a new chat
                </Button>
              </div>
            )}
            empty={
              <div className="m-auto max-w-[36rem] text-center">
                <p className="text-sm font-medium">You are connected</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  Drop files anywhere here or use the clip to send them. {HOST_NAME} can reply and send files back.
                </p>
              </div>
            }
          />
        </div>
        <Promises className="hidden py-3 sm:flex" />
      </div>
    </main>
  );
}
