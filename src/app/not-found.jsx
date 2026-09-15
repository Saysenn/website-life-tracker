import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center animate-rise">
        <p className="text-2xl font-semibold">404</p>
        <p className="mt-1 text-sm text-ink-3">This page does not exist.</p>
        <Link href="/" className={buttonClass({ variant: "secondary", className: "mt-5" })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
