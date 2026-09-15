"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { Spinner } from "./spinner";

const iconClass = "size-[1.6rem]";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      offset={20}
      mobileOffset={12}
      visibleToasts={4}
      icons={{
        success: <CircleCheck className={`${iconClass} text-[#a9cf9f]`} />,
        error: <CircleAlert className={`${iconClass} text-[#f2a58f]`} />,
        warning: <TriangleAlert className={`${iconClass} text-[#e9c27a]`} />,
        info: <Info className={`${iconClass} text-[#b9cfe0]`} />,
        loading: <Spinner className="size-[1.6rem] text-ground/70" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-xl bg-ink px-4 py-3 text-ground shadow-float sm:w-[36rem]",
          icon: "flex shrink-0 items-center",
          content: "min-w-0 flex-1",
          title: "text-sm font-medium leading-snug",
          description: "mt-0.5 text-xs text-ground/60",
          actionButton:
            "shrink-0 rounded-md bg-ground/12 px-2.5 py-1 text-xs font-medium text-ground transition-colors hover:bg-ground/22",
          cancelButton: "shrink-0 rounded-md px-2 py-1 text-xs text-ground/60 hover:text-ground",
        },
      }}
    />
  );
}
