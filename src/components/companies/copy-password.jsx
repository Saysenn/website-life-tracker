"use client";

import { Check, KeyRound, LockKeyhole } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revealPassword } from "@/actions/companies";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const KINDS = {
  key: { label: "Copy RDP key", copied: "RDP key copied", icon: KeyRound },
  provider: { label: "Copy provider password", copied: "Provider password copied", icon: LockKeyhole },
};

export function CopyPassword({ companyId, kind = "key", label, className }) {
  const { icon: Icon, ...text } = KINDS[kind];
  label ??= text.label;
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function copy(event) {
    event.stopPropagation();
    start(async () => {
      const result = await revealPassword(companyId, kind);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.password);
        setCopied(true);
        toast.success(text.copied);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error("Could not reach the clipboard");
      }
    });
  }

  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={copy}
        disabled={pending}
        className={cn(
          "flex size-6.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-hover hover:text-ink",
          className,
        )}
      >
        {copied ? <Check className="size-[1.3rem] text-success" /> : <Icon className="size-[1.3rem]" />}
      </button>
    </Tooltip>
  );
}
