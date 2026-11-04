"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let nextId = 0;

/**
 * Runs files through `process(file, onProgress, options)` one at a time and
 * tracks status + progress for each. Items: { id, file, preview, status, progress, result, error }.
 */
export function useFileQueue(process, { previews = false } = {}) {
  const [items, setItems] = useState([]);
  const list = useRef([]);
  const running = useRef(false);
  const options = useRef({});

  const commit = useCallback((change) => {
    list.current = change(list.current);
    setItems(list.current);
  }, []);

  const update = useCallback(
    (id, patch) => commit((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    [commit],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let next;
    while ((next = list.current.find((item) => item.status === "queued"))) {
      const { id, file } = next;
      update(id, { status: "working", progress: 0, error: null });
      try {
        let last = 0;
        const result = await process(
          file,
          (value) => {
            if (value - last < 0.02 && value < 1) return;
            last = value;
            update(id, { progress: value });
          },
          options.current,
        );
        update(id, { status: "done", progress: 1, result });
      } catch (error) {
        update(id, { status: "error", progress: 1, error: error?.message || "Something went wrong" });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    running.current = false;
  }, [process, update]);

  const start = useCallback(
    (nextOptions = {}) => {
      options.current = nextOptions;
      run();
    },
    [run],
  );

  const add = useCallback(
    (files) => {
      const added = [...files].map((file) => ({
        id: `f${++nextId}`,
        file,
        preview: previews && file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        status: "queued",
        progress: 0,
        result: null,
        error: null,
      }));
      commit((current) => [...current, ...added]);
      return added.length;
    },
    [commit, previews],
  );

  const remove = useCallback(
    (id) =>
      commit((current) => {
        const item = current.find((entry) => entry.id === id);
        if (item?.preview) URL.revokeObjectURL(item.preview);
        return current.filter((entry) => entry.id !== id);
      }),
    [commit],
  );

  const clear = useCallback(
    () =>
      commit((current) => {
        current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
        return current.filter((item) => item.status === "working");
      }),
    [commit],
  );

  /** Puts finished/failed items back in the queue (e.g. after changing output settings). */
  const requeue = useCallback(
    (filter = () => true) =>
      commit((current) =>
        current.map((item) =>
          item.status !== "working" && item.status !== "queued" && filter(item)
            ? { ...item, status: "queued", progress: 0, result: null, error: null }
            : item,
        ),
      ),
    [commit],
  );

  useEffect(() => () => list.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), []);

  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const busy = items.some((item) => item.status === "working");
  const queued = items.filter((item) => item.status === "queued").length;
  const progress = total ? items.reduce((sum, item) => sum + (item.status === "queued" ? 0 : item.progress), 0) / total : 0;

  return { items, add, start, remove, clear, requeue, stats: { total, done, failed, busy, queued, progress } };
}
