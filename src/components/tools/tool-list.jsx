import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/page";
import { ToolIcon } from "./tool-icon";

export function ToolList({ tools }) {
  return (
    <Page>
      <PageHeader title="Tools" description="Handy file utilities that run right in your browser" />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/tools/${tool.slug}`}
            className="group flex animate-rise items-start gap-3 rounded-2xl bg-surface p-4 shadow-card transition-colors hover:bg-sunken active:scale-[0.99]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-data-soft text-data">
              <ToolIcon name={tool.icon} className="size-[2rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{tool.title}</p>
              <p className="mt-0.5 text-xs text-ink-3">{tool.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {tool.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-2">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight className="mt-0.5 size-[1.5rem] shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Page>
  );
}
