import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/page";
import { stepCount } from "@/lib/guides";
import { plural } from "@/lib/utils";
import { GuideIcon } from "./guide-icon";

export function GuideList({ guides }) {
  return (
    <Page>
      <PageHeader title="Guides" description="Step-by-step notes you can open any time" />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="group flex animate-rise items-start gap-3 rounded-2xl bg-surface p-4 shadow-card transition-colors hover:bg-sunken"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-data-soft text-data">
              <GuideIcon name={guide.icon} className="size-[1.7rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{guide.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{guide.summary}</p>
              <p className="mt-2 text-2xs font-medium text-ink-4 tabular-nums">{plural(stepCount(guide), "step")}</p>
            </div>
            <ChevronRight className="mt-0.5 size-[1.5rem] shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Page>
  );
}
