import { Page } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArchiveLoading() {
  return (
    <Page>
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-2 h-3.5 w-52" />
      <div className="mt-5 grid gap-4">
        {Array.from({ length: 2 }, (_, card) => (
          <div key={card} className="grid gap-4 rounded-2xl bg-surface p-5 shadow-card">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 2 }, (_, row) => (
              <div key={row} className="flex items-center gap-4">
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="hidden h-3.5 w-20 sm:block" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Page>
  );
}
