"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="max-w-[36rem] text-center animate-rise">
        <p className="text-lg font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm text-ink-3">The page could not load. Your data is safe, try again in a moment.</p>
        <Button className="mt-5" variant="secondary" onClick={reset}>
          <RefreshCw /> Try again
        </Button>
      </div>
    </div>
  );
}
