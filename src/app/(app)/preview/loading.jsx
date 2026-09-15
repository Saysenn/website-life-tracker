import { Page } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function PreviewLoading() {
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>
        <Skeleton className="h-8 w-64 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-8 w-72 rounded-lg" />
      <Skeleton className="mt-4 h-28 w-full rounded-2xl" />
      <div className="mt-4 grid gap-3 rounded-2xl bg-surface p-4 shadow-card">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-24 sm:block" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </Page>
  );
}
