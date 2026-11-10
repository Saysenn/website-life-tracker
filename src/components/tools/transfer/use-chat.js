"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./api";

const FAST = 1500;
const SLOW = 6000;
const TYPING_WINDOW = 3000;

function merge(current, incoming) {
  if (!incoming.length) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * Polls one chat. Keeps the message list, the other side's presence and their
 * uploads in progress. `ended` turns true when the chat is gone.
 */
export function useChat(syncUrl, { role, onPeerMessages } = {}) {
  const [state, setState] = useState({ chat: null, peer: null, messages: [], files: {}, incoming: [], loaded: false });
  const [ended, setEnded] = useState(null);
  const cursor = useRef(0);
  const typedAt = useRef(0);
  const timer = useRef(null);
  const onPeer = useRef(onPeerMessages);
  const tick = useRef(null);

  useEffect(() => {
    onPeer.current = onPeerMessages;
  });

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const data = await call(syncUrl, {
        body: {
          after: cursor.current,
          typing: Date.now() - typedAt.current < TYPING_WINDOW,
          visible: document.visibilityState === "visible",
        },
      });
      const first = cursor.current === 0;
      cursor.current = Math.max(cursor.current, data.messages.at(-1)?.id ?? 0);
      setState((current) => ({
        chat: data.chat,
        peer: data.peer,
        files: data.files,
        incoming: data.incoming,
        messages: merge(current.messages, data.messages),
        loaded: true,
      }));
      if (!first) {
        const fromPeer = data.messages.filter((message) => message.sender !== role);
        if (fromPeer.length) onPeer.current?.(fromPeer, data);
      }
    } catch (error) {
      if ([401, 404].includes(error.status)) return setEnded(error.message);
    }
    timer.current = setTimeout(() => tick.current?.(), document.visibilityState === "visible" ? FAST : SLOW);
  }, [syncUrl, role]);

  useEffect(() => {
    tick.current = run;
  }, [run]);

  useEffect(() => {
    run();
    const wake = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [run]);

  const addMessage = useCallback((message) => {
    setState((current) => ({
      ...current,
      messages: merge(current.messages, [message]),
      files: message.file ? { ...current.files, [message.file.id]: message.file.status } : current.files,
    }));
  }, []);

  const markTyping = useCallback(() => {
    typedAt.current = Date.now();
  }, []);

  return { ...state, ended, addMessage, markTyping, refresh: run };
}
