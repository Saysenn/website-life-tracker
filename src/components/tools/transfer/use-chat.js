"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./api";

const FAST = 1500;
const SLOW = 6000;
const TYPING_WINDOW = 3000;

function merge(current, incoming, gone) {
  const fresh = incoming.filter((message) => !gone.has(message.id));
  if (!fresh.length) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  fresh.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Drops messages up to `upTo` that the server no longer has (unsent by either side). */
function prune(messages, ids, upTo) {
  if (!ids) return messages;
  const kept = new Set(ids);
  const next = messages.filter((message) => message.id > upTo || kept.has(message.id));
  return next.length === messages.length ? messages : next;
}

/**
 * Polls one chat. Keeps the message list, the other side's presence and their
 * uploads in progress. `ended` turns true when the chat is gone.
 */
export function useChat(syncUrl, { role, onPeerMessages, onPeerUnsent } = {}) {
  const [state, setState] = useState({ chat: null, peer: null, messages: [], files: {}, incoming: [], loaded: false });
  const [ended, setEnded] = useState(null);
  const cursor = useRef(0);
  const typedAt = useRef(0);
  const timer = useRef(null);
  const onPeer = useRef(onPeerMessages);
  const onPeerGone = useRef(onPeerUnsent);
  const tick = useRef(null);
  const messagesRef = useRef(state.messages);
  // Ids this side unsent, so a poll already in flight cannot bring them back.
  const gone = useRef(new Set());

  useEffect(() => {
    onPeer.current = onPeerMessages;
    onPeerGone.current = onPeerUnsent;
    messagesRef.current = state.messages;
  });

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const after = cursor.current;
      const data = await call(syncUrl, {
        body: {
          after,
          known: messagesRef.current.filter((message) => message.id <= after).length,
          typing: Date.now() - typedAt.current < TYPING_WINDOW,
          visible: document.visibilityState === "visible",
        },
      });
      const first = after === 0;
      const vanished = data.ids
        ? messagesRef.current.filter((message) => message.id <= after && !data.ids.includes(message.id))
        : [];
      cursor.current = Math.max(cursor.current, data.messages.at(-1)?.id ?? 0);
      setState((current) => ({
        chat: data.chat,
        peer: data.peer,
        files: data.files,
        incoming: data.incoming,
        messages: merge(prune(current.messages, data.ids, after), data.messages, gone.current),
        loaded: true,
      }));
      const peerGone = vanished.filter((message) => message.sender !== role);
      if (peerGone.length) onPeerGone.current?.(peerGone);
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
      messages: merge(current.messages, [message], gone.current),
      files: message.file ? { ...current.files, [message.file.id]: message.file.status } : current.files,
    }));
  }, []);

  /** Takes a message off the list right away. Returns a function that puts it back. */
  const removeMessage = useCallback((id) => {
    gone.current.add(id);
    setState((current) => ({ ...current, messages: current.messages.filter((message) => message.id !== id) }));
    const message = messagesRef.current.find((each) => each.id === id);
    return () => {
      gone.current.delete(id);
      if (message)
        setState((current) => ({ ...current, messages: merge(current.messages, [message], gone.current) }));
    };
  }, []);

  const markTyping = useCallback(() => {
    typedAt.current = Date.now();
  }, []);

  return { ...state, ended, addMessage, removeMessage, markTyping, refresh: run };
}
