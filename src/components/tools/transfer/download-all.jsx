import { FolderDown } from "lucide-react";
import { cn, plural } from "@/lib/utils";

/** Counts finished files in a chat's status map. */
export const readyCount = (files) =>
  Object.values(files ?? {}).filter((status) => status === "ready").length;

/** One zip of every finished file, streamed by the server. */
export function DownloadAll({ href, count, compact = false, className }) {
  if (!count) return null;
  return (
    <a
      href={href}
      download
      aria-label={`Download all ${plural(count, "file")} as a zip`}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-medium text-ink transition-colors hover:bg-hover",
        className,
      )}
    >
      <FolderDown className="size-[1.4rem]" />
      {compact ? count : `Download all (${count})`}
    </a>
  );
}
