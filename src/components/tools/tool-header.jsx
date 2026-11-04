import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "./tool-icon";

export function ToolHeader({ icon, title, description }) {
  return (
    <>
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-[1.4rem]" />
        Tools
      </Link>
      <div className="mt-4 flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-data-soft text-data">
          <ToolIcon name={icon} className="size-[2rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="mt-0.5 text-sm text-ink-3">{description}</p>
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
        <ShieldCheck className="size-[1.4rem]" />
        Runs on this device — files are never uploaded
      </p>
    </>
  );
}
