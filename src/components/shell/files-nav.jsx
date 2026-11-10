"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/tools/file-transfer", label: "File transfer" },
  { href: "/tools/metadata-cleaner", label: "Metadata cleaner" },
];

export function FilesNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-sm transition-colors",
            pathname === link.href ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
