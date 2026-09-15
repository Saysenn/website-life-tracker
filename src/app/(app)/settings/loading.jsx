import { Page } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <Page className="max-w-[112rem]">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-2 h-3.5 w-60" />
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex gap-1 lg:w-[24rem] lg:shrink-0 lg:flex-col">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-32 rounded-xl lg:w-full" />
          ))}
        </div>
        <div className="min-w-0 flex-1 rounded-2xl bg-surface p-5 shadow-card">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
          <div className="mt-6 grid gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
