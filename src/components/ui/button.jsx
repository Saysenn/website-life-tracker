import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const variants = {
  primary: "bg-ink text-ground hover:bg-ink/85",
  secondary: "bg-surface text-ink shadow-card hover:bg-sunken",
  soft: "bg-sunken text-ink hover:bg-hover",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const sizes = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-sm",
  md: "h-8.5 gap-2 rounded-lg px-3.5 text-sm",
  icon: "size-8.5 rounded-lg",
  "icon-sm": "size-7 rounded-md",
};

export function buttonClass({ variant = "primary", size = "md", className } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.4rem] [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, pending = false, type = "button", disabled, className, children, ...props }) {
  return (
    <button type={type} disabled={disabled || pending} className={buttonClass({ variant, size, className })} {...props}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}
