"use client";

import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Lightbulb, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/ui/page";
import { useStoredState } from "@/hooks/use-stored-state";
import { stepCount } from "@/lib/guides";
import { cn, plural } from "@/lib/utils";
import { GuideIcon } from "./guide-icon";

const NONE = [];

const hostOf = (url) => new URL(url).host.replace(/^www\./, "");

function Step({ number, step, done, onToggle, last }) {
  return (
    <li className="relative flex gap-3.5">
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[1.35rem] w-px bg-grid" />}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark step ${number} as not done` : `Mark step ${number} as done`}
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
          done ? "bg-success text-white" : "bg-sunken text-ink-2 hover:bg-hover",
        )}
      >
        {done ? <Check className="size-[1.3rem]" strokeWidth={2.5} /> : number}
      </button>

      <div className={cn("min-w-0 flex-1 pb-6", last && "pb-1")}>
        <p className={cn("pt-1 font-medium text-ink transition-colors", done && "text-ink-3 line-through decoration-ink-4")}>
          {step.title}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">{step.body}</p>

        {step.path && (
          <p className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            {step.path.map((part, index) => (
              <span key={part} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="size-[1.2rem] text-ink-4" />}
                <span className="rounded-md bg-sunken px-1.5 py-0.5 font-medium text-ink-2">{part}</span>
              </span>
            ))}
          </p>
        )}

        {step.link && (
          <a
            href={step.link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-data-soft px-2.5 text-sm font-medium text-data transition-colors hover:bg-data-soft/70"
          >
            {hostOf(step.link)}
            <ArrowUpRight className="size-[1.3rem]" />
          </a>
        )}
      </div>
    </li>
  );
}

export function GuideViewer({ guide }) {
  const [done, setDone] = useStoredState(`guide-progress:${guide.slug}`, NONE);
  const total = stepCount(guide);
  const finished = done.length;

  const toggle = (id) =>
    setDone((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const offsets = guide.phases.map((_, index) =>
    guide.phases.slice(0, index).reduce((sum, phase) => sum + phase.steps.length, 0),
  );

  return (
    <Page className="max-w-[76rem]">
      <Link href="/guides" className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-[1.4rem]" />
        Guides
      </Link>

      <div className="mt-4 flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-data-soft text-data">
          <GuideIcon name={guide.icon} className="size-[2rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{guide.title}</h1>
          <p className="mt-0.5 text-sm text-ink-3">{guide.summary}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
          <div
            className="h-full rounded-full bg-success transition-[width] duration-300"
            style={{ width: `${(finished / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-ink-3 tabular-nums">
          {finished} of {plural(total, "step")}
        </span>
        {finished > 0 && (
          <button
            type="button"
            onClick={() => setDone(NONE)}
            className="flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink"
          >
            <RotateCcw className="size-[1.2rem]" />
            Reset
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-3">
        {guide.phases.map((phase, phaseIndex) => (
          <section key={phase.title} className="animate-rise rounded-2xl bg-surface p-4 shadow-card sm:p-5">
            <p className="text-2xs font-medium text-ink-3">Part {phaseIndex + 1}</p>
            <h2 className="mb-4 text-base font-semibold">{phase.title}</h2>
            <ol>
              {phase.steps.map((step, index) => {
                const id = `${phaseIndex}.${index}`;
                return (
                  <Step
                    key={id}
                    number={offsets[phaseIndex] + index + 1}
                    step={step}
                    done={done.includes(id)}
                    onToggle={() => toggle(id)}
                    last={index === phase.steps.length - 1}
                  />
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {guide.tip && (
        <p className="mt-3 flex items-start gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <Lightbulb className="mt-0.5 size-[1.5rem] shrink-0" />
          {guide.tip}
        </p>
      )}
    </Page>
  );
}
