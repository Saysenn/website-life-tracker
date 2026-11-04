"use client";

import { useCallback, useState } from "react";

const LIMIT = 100;

/**
 * State with undo/redo. `set(updater)` records a step; pass `{ record: false }`
 * for live updates during a gesture and call `checkpoint()` once when it starts.
 */
export function useHistory(initial) {
  const [history, setHistory] = useState({ past: [], present: initial, future: [] });

  const set = useCallback(
    (updater, { record = true } = {}) =>
      setHistory((current) => {
        const next = typeof updater === "function" ? updater(current.present) : updater;
        if (next === current.present) return current;
        return record
          ? { past: [...current.past.slice(-LIMIT), current.present], present: next, future: [] }
          : { ...current, present: next };
      }),
    [],
  );

  const checkpoint = useCallback(
    () =>
      setHistory((current) => ({ past: [...current.past.slice(-LIMIT), current.present], present: current.present, future: [] })),
    [],
  );

  const undo = useCallback(
    () =>
      setHistory((current) =>
        current.past.length
          ? { past: current.past.slice(0, -1), present: current.past.at(-1), future: [current.present, ...current.future] }
          : current,
      ),
    [],
  );

  const redo = useCallback(
    () =>
      setHistory((current) =>
        current.future.length
          ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) }
          : current,
      ),
    [],
  );

  const reset = useCallback((value) => setHistory({ past: [], present: value, future: [] }), []);

  return {
    state: history.present,
    set,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
