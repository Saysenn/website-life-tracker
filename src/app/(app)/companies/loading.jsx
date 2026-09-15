import { Page } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

function TableSkeleton() {
  return (
    <div className="grid gap-2.5 px-2">
      <Skeleton className="h-3 w-20" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 py-1">
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function CompaniesLoading() {
  return (
    <Page>
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-3.5 w-48" />
        </div>
        <Skeleton className="h-8.5 w-32 rounded-lg" />
      </div>
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-8.5 w-full max-w-[32rem] rounded-lg" />
        <Skeleton className="h-8.5 w-64 rounded-lg" />
      </div>
      <div className="mt-5 grid gap-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="grid gap-4 rounded-2xl bg-surface px-3 py-4 shadow-card">
            <div className="flex items-center gap-3 px-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mx-2 h-8 w-64 rounded-lg" />
            <TableSkeleton />
          </div>
        ))}
      </div>
    </Page>
  );
}
