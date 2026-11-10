"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { chime, desktopAlert, previewOf } from "./alerts";
import { call } from "./api";

const EVERY = 15_000;
export const TRANSFER_PATH = "/tools/file-transfer";

/**
 * Watches file transfer chats from every other page, so a new chat or message
 * shows up as a toast wherever the admin is. Returns the unread count.
 */
export function useTransferWatcher(pathname) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const seen = useRef(null);
  const onPage = pathname.startsWith(TRANSFER_PATH);

  useEffect(() => {
    if (onPage) {
      seen.current = null;
      return;
    }
    let timer;
    let alive = true;

    const open = (id) => router.push(`${TRANSFER_PATH}?chat=${id}`);

    const check = async () => {
      try {
        const { chats } = await call("/api/transfer/admin/chats", { method: "GET" });
        if (!alive) return;
        const previous = seen.current;
        if (previous) {
          chats.forEach((chat) => {
            const before = previous.get(chat.id);
            const title = before === undefined ? `${chat.name} opened your transfer link` : chat.name;
            if (before !== undefined && chat.unread <= before) return;
            const body = before === undefined ? [chat.ip, chat.location].filter(Boolean).join(" · ") : previewOf(chat.last);
            chime();
            toast(title, { description: body, action: { label: "Open", onClick: () => open(chat.id) } });
            desktopAlert(title, body, () => open(chat.id));
          });
        }
        seen.current = new Map(chats.map((chat) => [chat.id, chat.unread]));
        setUnread(chats.reduce((total, chat) => total + chat.unread, 0));
      } catch {}
      if (alive) timer = setTimeout(check, EVERY);
    };

    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [onPage, router]);

  return onPage ? 0 : unread;
}
