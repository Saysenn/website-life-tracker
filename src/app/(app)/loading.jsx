import { Page } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ rows = 5, className }) {
  return (
    <div className={`rounded-2xl bg-surface p-5 shadow-card ${className ?? ""}`}>
      <Skeleton className="h-4 w-36" />
      <div className="mt-5 grid gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <Page>
      <Skeleton className="h-6 w-36" />
      <Skeleton className="mt-2 h-3.5 w-52" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-2xl bg-surface p-4 shadow-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3.5 h-7 w-14" />
            <Skeleton className="mt-2.5 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <CardSkeleton rows={6} className="lg:col-span-3" />
        <CardSkeleton rows={6} className="lg:col-span-2" />
      </div>
    </Page>
  );
}
