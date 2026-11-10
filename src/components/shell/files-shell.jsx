import { LogOut } from "lucide-react";
import { logout } from "@/actions/auth";
import { BrandMark } from "./brand";

/** The whole app for the file transfer account: no sidebar, and no Life Tracker data is loaded. */
export function FilesShell({ children }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-13 shrink-0 items-center gap-2.5 px-4 lg:px-8">
        <BrandMark />
        <span className="text-base font-semibold tracking-tight">File transfer</span>
        <form action={logout} className="ml-auto">
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            <LogOut className="size-[1.4rem]" strokeWidth={1.75} />
            Sign out
          </button>
        </form>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
