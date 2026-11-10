"use client";

import {
  ArrowLeft,
  Bell,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Lock,
  LockOpen,
  MessageSquare,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Page } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { RETENTION_DAYS } from "@/lib/transfer/constants";
import { formatBytes } from "@/lib/tools/files";
import { cn, plural } from "@/lib/utils";
import { ToolHeader } from "../tool-header";
import { chime, desktopAlert, previewOf } from "./alerts";
import { call } from "./api";
import { countdown, device, initials, timeAgo, useNow } from "./format";
import { DownloadAll, readyCount } from "./download-all";
import { FileGlyph, Thread } from "./thread";

const LIST_FAST = 4000;
const LIST_SLOW = 15000;
const noop = () => () => {};
const RETENTION = `${RETENTION_DAYS} days`;

function deletesIn(expiresAt, now) {
  return expiresAt ? `deletes in ${countdown(expiresAt - now)}` : "kept until you delete it";
}

function Avatar({ name, online, className }) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-hover text-xs font-semibold text-ink-2",
        className,
      )}
    >
      {initials(name)}
      {online !== undefined && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-surface",
            online ? "bg-good" : "bg-ink-4",
          )}
        />
      )}
    </span>
  );
}

function copy(text, label) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy"),
  );
}

function AutoDelete({ value, onChange }) {
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async (next) => {
    setSaving(true);
    onChange(next);
    try {
      await call("/api/transfer/admin/settings", { body: { autoDelete: next } });
      toast.success(next ? `Auto-delete on · ${RETENTION}` : "Auto-delete off", {
        description: next
          ? `Chats and files delete ${RETENTION} after they start.`
          : "Chats and files stay until you delete them.",
      });
    } catch (error) {
      onChange(!next);
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <Timer className="size-[1.3rem]" />
        <span>Delete chats and files after {RETENTION}</span>
        <Switch
          checked={value}
          disabled={saving}
          onCheckedChange={(next) => (next ? setConfirm(true) : save(false))}
        />
      </label>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Turn auto-delete back on?"
        description={`Chats that started more than ${RETENTION} ago are deleted straight away, with all their files.`}
        confirmLabel="Turn on"
        onConfirm={() => save(true)}
      />
    </>
  );
}

function LinkCard({ linkKey, onRotate, stats, autoDelete, onAutoDelete }) {
  const [confirm, setConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [, rerender] = useReducer((count) => count + 1, 0);
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const permission = useSyncExternalStore(
    noop,
    () =>
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    () => "unsupported",
  );

  const url = origin ? `${origin}/send/${linkKey}` : "";

  const rotate = async () => {
    setRotating(true);
    try {
      const { key } = await call("/api/transfer/admin/link");
      onRotate(key);
      toast.success("New link ready", {
        description: "The old link no longer starts new chats.",
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <section className="mt-5 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Your transfer link</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Anyone with it can start a chat and send you files. Share it only
            with people you trust.
          </p>
        </div>
        {permission === "default" && (
          <Button
            variant="soft"
            size="sm"
            onClick={() => Notification.requestPermission().then(rerender)}
          >
            <Bell />
            Desktop alerts
          </Button>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-0 flex-1 basis-[28rem] items-center gap-2 rounded-lg bg-sunken px-3">
          <Lock className="size-[1.3rem] shrink-0 text-success" />
          {url ? (
            <span className="truncate text-sm text-ink-2 tabular-nums select-all">
              {url}
            </span>
          ) : (
            <Skeleton className="h-3 w-48" />
          )}
        </div>
        <div className="flex gap-1.5">
          <Button onClick={() => copy(url, "Link")} disabled={!url}>
            <Copy />
            Copy link
          </Button>
          <Tooltip label="Open the guest page">
            <a
              href={url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the guest page"
              className="flex size-8.5 items-center justify-center rounded-lg bg-sunken text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              <ExternalLink className="size-[1.4rem]" />
            </a>
          </Tooltip>
          <Tooltip label="Make a new link">
            <Button
              variant="soft"
              size="icon"
              pending={rotating}
              onClick={() => setConfirm(true)}
              aria-label="Make a new link"
            >
              {!rotating && <RefreshCw />}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-[1.3rem] text-success" />
          Encrypted at rest
        </span>
        <AutoDelete value={autoDelete} onChange={onAutoDelete} />
        <span className="tabular-nums">
          {plural(stats.chats, "chat")} · {plural(stats.files, "file")} ·{" "}
          {formatBytes(stats.bytes)} stored
        </span>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Make a new link?"
        description="The current link stops working for new people straight away. Chats that already started carry on."
        confirmLabel="Make new link"
        onConfirm={rotate}
      />
    </section>
  );
}

function ChatList({ chats, selected, onSelect }) {
  if (!chats) {
    return (
      <div className="grid gap-2 p-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-15 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!chats.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <MessageSquare className="size-[2.4rem] text-ink-4" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium">No chats yet</p>
        <p className="mt-0.5 text-xs text-ink-3">
          Send your link to someone. Their chat shows up here the moment they
          open it.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-0.5 p-1.5">
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            type="button"
            onClick={() => onSelect(chat.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-sunken",
              selected === chat.id && "bg-selected hover:bg-selected",
            )}
          >
            <Avatar name={chat.name} online={chat.online} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p
                  className={cn(
                    "truncate text-sm",
                    chat.unread ? "font-semibold" : "font-medium",
                  )}
                >
                  {chat.name}
                </p>
                <span className="ml-auto shrink-0 text-2xs text-ink-4 tabular-nums">
                  {timeAgo(chat.activeAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "truncate text-xs",
                    chat.typing
                      ? "text-data"
                      : chat.unread
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  {chat.typing
                    ? "typing…"
                    : chat.last
                      ? previewOf(chat.last)
                      : chat.ip}
                </p>
                {chat.blocked && (
                  <Lock className="size-[1.1rem] shrink-0 text-ink-4" />
                )}
                {chat.unread > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[0.9rem] font-semibold text-white tabular-nums">
                    {chat.unread > 9 ? "9+" : chat.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Detail({ icon: Icon, children, onClick, label }) {
  const content = (
    <>
      <Icon className="size-[1.2rem] shrink-0" />
      <span className="truncate">{children}</span>
    </>
  );
  const className =
    "inline-flex max-w-full items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-2xs text-ink-2";
  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          className,
          "transition-colors hover:bg-hover hover:text-ink",
        )}
      >
        {content}
      </button>
    </Tooltip>
  );
}

function ChatHeader({
  chat,
  peer,
  files,
  summary,
  onBack,
  onToggleBlock,
  onDelete,
}) {
  const now = useNow();
  const info = chat ?? summary;
  if (!info) return <div className="h-17 shrink-0" />;
  const status = peer?.typing
    ? "Typing…"
    : peer?.online
      ? "Online now"
      : peer?.seenAt
        ? `Last seen ${timeAgo(peer.seenAt, now)}`
        : "Offline";

  return (
    <div className="flex shrink-0 items-start gap-2.5 border-b border-grid px-3 py-3 sm:px-5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to chats"
        className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover lg:hidden"
      >
        <ArrowLeft className="size-[1.6rem]" />
      </button>
      <Avatar name={info.name} online={peer?.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight">
          {info.name}
        </p>
        <p
          className={cn(
            "text-xs",
            peer?.typing || peer?.online ? "text-success" : "text-ink-3",
          )}
        >
          {status}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {info.ip && (
            <Detail
              icon={Globe}
              onClick={() => copy(info.ip, "IP address")}
              label="Copy IP address"
            >
              {info.ip}
            </Detail>
          )}
          {info.location && <Detail icon={Globe}>{info.location}</Detail>}
          {info.userAgent && (
            <Detail icon={MonitorSmartphone}>{device(info.userAgent)}</Detail>
          )}
          <Detail icon={Timer}>
            {info.expiresAt
              ? `Deletes in ${countdown(info.expiresAt - now)}`
              : "Kept until you delete it"}
          </Detail>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DownloadAll
          href={`/api/transfer/files/zip?chat=${info.id}`}
          count={readyCount(files)}
          compact
          className="sm:hidden"
        />
        <DownloadAll
          href={`/api/transfer/files/zip?chat=${info.id}`}
          count={readyCount(files)}
          className="hidden sm:inline-flex"
        />
        <Tooltip label={info.blocked ? "Reopen chat" : "Close chat"}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleBlock}
            aria-label={info.blocked ? "Reopen chat" : "Close chat"}
          >
            {info.blocked ? <LockOpen /> : <Lock />}
          </Button>
        </Tooltip>
        <Tooltip label="Delete chat and files">
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete chat"
          >
            <Trash2 />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function FilesList({ files, onOpenChat, onDelete }) {
  const now = useNow();
  if (!files) return <Skeleton className="mt-4 h-40 rounded-2xl" />;
  if (!files.length) {
    return (
      <div className="mt-4 rounded-2xl bg-surface px-6 py-14 text-center shadow-card">
        <p className="text-sm font-medium">No files yet</p>
        <p className="mt-0.5 text-xs text-ink-3">
          Everything sent either way shows up here until it is deleted.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3 tabular-nums">
          {plural(files.length, "file")} ·{" "}
          {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
        </p>
        <DownloadAll
          href="/api/transfer/files/zip?all=1"
          count={files.length}
        />
      </div>
      <ul className="mt-2 grid gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex animate-rise items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
          >
            <FileGlyph file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="truncate text-xs text-ink-3 tabular-nums">
                {formatBytes(file.size)} ·{" "}
                {file.sender === "guest"
                  ? `From ${file.chatName}`
                  : `To ${file.chatName}`}{" "}
                · {timeAgo(file.createdAt, now)} ·{" "}
                {deletesIn(file.expiresAt, now)}
              </p>
            </div>
            <Tooltip label="Open chat">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChat(file.chatId)}
                aria-label="Open chat"
              >
                <MessageSquare />
              </Button>
            </Tooltip>
            <Tooltip label="Delete file">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(file)}
                aria-label="Delete file"
              >
                <Trash2 />
              </Button>
            </Tooltip>
            <Tooltip label="Download">
              <a
                href={`/api/transfer/files/${file.id}`}
                download={file.name}
                aria-label={`Download ${file.name}`}
                className="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-ink text-ground transition-colors hover:bg-ink/85"
              >
                <Download className="size-[1.5rem]" />
              </a>
            </Tooltip>
          </li>
        ))}
      </ul>
    </>
  );
}

export function FileTransfer({
  linkKey,
  autoDelete: initialAutoDelete = true,
  initialChat,
  full = true,
}) {
  const [key, setKey] = useState(linkKey);
  const [autoDelete, setAutoDelete] = useState(initialAutoDelete);
  const [tab, setTab] = useState("chats");
  const [selected, setSelected] = useState(initialChat || null);
  const [data, setData] = useState({ chats: null, files: null });
  const [confirm, setConfirm] = useState(null);
  const seen = useRef(null);
  const selectedRef = useRef(selected);
  const timer = useRef(null);
  const tick = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const next = await call("/api/transfer/admin/chats?files=1", {
        method: "GET",
      });
      const previous = seen.current;
      if (previous) {
        next.chats.forEach((chat) => {
          const before = previous.get(chat.id);
          const watching = chat.id === selectedRef.current && !document.hidden;
          if (before === undefined) {
            chime();
            toast(`${chat.name} opened your link`, {
              description: [chat.ip, chat.location].filter(Boolean).join(" · "),
              action: { label: "Open", onClick: () => setSelected(chat.id) },
            });
            desktopAlert(`${chat.name} opened your link`, chat.ip ?? "", () =>
              setSelected(chat.id),
            );
          } else if (chat.unread > before && !watching) {
            chime();
            toast(chat.name, {
              description: previewOf(chat.last),
              action: { label: "Open", onClick: () => setSelected(chat.id) },
            });
            desktopAlert(chat.name, previewOf(chat.last), () =>
              setSelected(chat.id),
            );
          }
        });
      }
      seen.current = new Map(next.chats.map((chat) => [chat.id, chat.unread]));
      setData(next);
    } catch (error) {
      if (error.status === 401) return toast.error(error.message);
    }
    timer.current = setTimeout(
      () => tick.current?.(),
      document.hidden ? LIST_SLOW : LIST_FAST,
    );
  }, []);

  useEffect(() => {
    tick.current = load;
  }, [load]);

  useEffect(() => {
    timer.current = setTimeout(load, 0);
    const wake = () => !document.hidden && load();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [load]);

  const unread =
    data.chats?.reduce(
      (total, chat) => total + (chat.id === selected ? 0 : chat.unread),
      0,
    ) ?? 0;
  useEffect(() => {
    document.title = unread
      ? `(${unread}) File transfer · Life Tracker`
      : "File transfer · Life Tracker";
  }, [unread]);

  const stats = useMemo(
    () => ({
      chats: data.chats?.length ?? 0,
      files: data.files?.length ?? 0,
      bytes: data.files?.reduce((total, file) => total + file.size, 0) ?? 0,
    }),
    [data],
  );

  const summary = data.chats?.find((chat) => chat.id === selected) ?? null;

  const select = (id) => {
    setSelected(id);
    setTab("chats");
    const url = new URL(window.location.href);
    url.searchParams.set("chat", id);
    window.history.replaceState(null, "", url);
  };

  const toggleBlock = async (chat) => {
    try {
      await call(`/api/transfer/admin/chats/${chat.id}`, {
        method: "PATCH",
        body: { blocked: !chat.blocked },
      });
      toast.success(chat.blocked ? "Chat reopened" : "Chat closed", {
        description: chat.blocked
          ? undefined
          : `${chat.name} can no longer send anything.`,
      });
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const runDelete = async () => {
    const target = confirm;
    setConfirm(null);
    try {
      if (target.kind === "chat") {
        await call(`/api/transfer/admin/chats/${target.item.id}`, {
          method: "DELETE",
        });
        if (selected === target.item.id) setSelected(null);
        toast.success("Chat deleted");
      } else {
        await call(`/api/transfer/files/${target.item.id}`, {
          method: "DELETE",
        });
        toast.success("File deleted");
      }
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Page className="flex min-h-full flex-col">
      <ToolHeader
        icon="transfer"
        title="File transfer"
        description="Swap files of any type with anyone you send your link to, and chat with them live."
        badge={
          autoDelete
            ? `Encrypted · deleted automatically after ${RETENTION}`
            : "Encrypted · auto-delete off"
        }
        back={full}
      />

      <LinkCard
        linkKey={key}
        onRotate={setKey}
        stats={stats}
        autoDelete={autoDelete}
        onAutoDelete={setAutoDelete}
      />

      <div className="mt-5 flex items-center gap-3">
        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: "chats", label: "Chats", count: data.chats?.length },
            { value: "files", label: "Files", count: data.files?.length },
          ]}
        />
      </div>

      {tab === "files" ? (
        <FilesList
          files={data.files}
          onOpenChat={select}
          onDelete={(file) => setConfirm({ kind: "file", item: file })}
        />
      ) : (
        <div className="mt-4 grid h-[calc(100dvh-14rem)] min-h-[52rem] overflow-hidden rounded-2xl bg-surface shadow-card lg:h-[calc(100dvh-30rem)] lg:grid-cols-[30rem_1fr]">
          <div
            className={cn(
              "min-h-0 overflow-y-auto border-grid lg:block lg:border-r",
              selected && "hidden",
            )}
          >
            <ChatList
              chats={data.chats}
              selected={selected}
              onSelect={select}
            />
          </div>
          <div
            className={cn(
              "min-h-0 bg-ground/40",
              !selected && "hidden lg:block",
            )}
          >
            {selected ? (
              <Thread
                key={selected}
                role="admin"
                syncUrl={`/api/transfer/admin/chats/${selected}/sync`}
                messagesUrl={`/api/transfer/admin/chats/${selected}/messages`}
                filesUrl={`/api/transfer/admin/chats/${selected}/files`}
                peerName={summary?.name ?? "They"}
                onPeerMessages={(messages) => {
                  if (!document.hidden) return;
                  chime();
                  desktopAlert(
                    summary?.name ?? "New message",
                    previewOf(messages.at(-1)),
                  );
                }}
                renderHeader={({ chat, peer, files }) => (
                  <ChatHeader
                    chat={chat}
                    peer={peer}
                    files={files}
                    summary={summary}
                    onBack={() => setSelected(null)}
                    onToggleBlock={() => toggleBlock(chat ?? summary)}
                    onDelete={() =>
                      setConfirm({ kind: "chat", item: chat ?? summary })
                    }
                  />
                )}
                renderEnded={() => (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <p className="text-sm font-medium">This chat is gone</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      It was deleted or passed its {RETENTION}.
                    </p>
                    <Button
                      variant="soft"
                      size="sm"
                      className="mt-3"
                      onClick={() => setSelected(null)}
                    >
                      Back to chats
                    </Button>
                  </div>
                )}
                empty={
                  <p className="m-auto max-w-[32rem] text-center text-xs text-ink-3">
                    Say hello, or drop files here to send them.
                    {autoDelete &&
                      ` Everything in this chat is deleted ${RETENTION} after it started.`}
                  </p>
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-sunken text-ink-3">
                  <MessageSquare className="size-[2rem]" strokeWidth={1.5} />
                </span>
                <p className="mt-3 text-sm font-medium">Pick a chat</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  See who is sending files, where from, and reply in real time.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "chat"
            ? `Delete the chat with ${confirm.item.name}?`
            : `Delete ${confirm?.item.name}?`
        }
        description={
          confirm?.kind === "chat"
            ? "Every message and file in it is removed for both of you. This cannot be undone."
            : "It is removed for both of you. This cannot be undone."
        }
        onConfirm={runDelete}
      />
    </Page>
  );
}
