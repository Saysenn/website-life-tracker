"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw, fallback) {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function useStoredState(key, fallback) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => parse(raw, fallback), [raw, fallback]);

  const setValue = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(parse(read(key), fallback)) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {}
      listeners.forEach((listener) => listener());
    },
    [key, fallback],
  );

  return [value, setValue];
}
