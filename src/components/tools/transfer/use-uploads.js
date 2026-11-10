"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile } from "./api";

const ACTIVE_FILES = 2;
let counter = 0;

/**
 * Upload queue. Two files go at once; each tracks bytes sent, speed and time left.
 * Finished uploads call onSent with the chat message the server created.
 */
export function useUploads({ onSent, onError }) {
  const [items, setItems] = useState([]);
  const queue = useRef([]);
  const controllers = useRef(new Map());
  const callbacks = useRef({ onSent, onError });
  const active = useRef(0);
  const jobs = useRef(new Map());

  useEffect(() => {
    callbacks.current = { onSent, onError };
  });

  const patch = useCallback((key, values) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...values } : item)));
  }, []);

  const pump = useCallback(function run() {
    while (active.current < ACTIVE_FILES && queue.current.length) {
      const job = queue.current.shift();
      const controller = new AbortController();
      controllers.current.set(job.key, controller);
      active.current += 1;
      const startedAt = performance.now();
      patch(job.key, { status: "uploading", startedAt });

      uploadFile({
        file: job.file,
        createUrl: job.createUrl,
        signal: controller.signal,
        onProgress: (loaded) => {
          const seconds = (performance.now() - startedAt) / 1000;
          const speed = seconds > 0.3 ? loaded / seconds : 0;
          patch(job.key, { loaded, speed, eta: speed ? (job.file.size - loaded) / speed : Infinity });
        },
      })
        .then((message) => {
          jobs.current.delete(job.key);
          setItems((current) => current.filter((item) => item.key !== job.key));
          callbacks.current.onSent?.(message);
        })
        .catch((error) => {
          if (error.aborted) return setItems((current) => current.filter((item) => item.key !== job.key));
          patch(job.key, { status: "error", error: error.message });
          callbacks.current.onError?.(error);
        })
        .finally(() => {
          controllers.current.delete(job.key);
          active.current -= 1;
          run();
        });
    }
  }, [patch]);

  const add = useCallback(
    (fileList, createUrl) => {
      const added = Array.from(fileList).map((file) => ({ key: `u${++counter}`, file, createUrl }));
      if (!added.length) return;
      added.forEach((job) => jobs.current.set(job.key, job));
      setItems((current) => [
        ...current,
        ...added.map(({ key, file }) => ({
          key,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          loaded: 0,
          speed: 0,
          eta: Infinity,
          status: "queued",
        })),
      ]);
      queue.current.push(...added);
      pump();
    },
    [pump],
  );

  const cancel = useCallback((key) => {
    queue.current = queue.current.filter((job) => job.key !== key);
    jobs.current.delete(key);
    const controller = controllers.current.get(key);
    if (controller) controller.abort();
    else setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const retry = useCallback(
    (key) => {
      const job = jobs.current.get(key);
      if (!job) return;
      queue.current.push(job);
      patch(key, { status: "queued", loaded: 0, error: null });
      pump();
    },
    [patch, pump],
  );

  useEffect(() => {
    const running = controllers.current;
    return () => running.forEach((controller) => controller.abort());
  }, []);

  useEffect(() => {
    const busy = items.some((item) => item.status === "uploading" || item.status === "queued");
    if (!busy) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items]);

  return { items, add, cancel, retry };
}
