import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-card text-foreground",
};

function Button({
  className,
  variant = "default",
  render,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: Variant;
  render?: React.ReactElement<{ className?: string; children?: React.ReactNode }>;
}) {
  const classes = cn(
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 px-5 font-display text-sm font-extrabold tracking-wide select-none",
    "shadow-[3px_3px_0_var(--border)] transition-[transform,box-shadow] duration-100",
    "hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--border)]",
    "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    className,
  );
  // render prop mirrors the old Base UI composition API so pages stay unchanged
  if (render) return React.cloneElement(render, { className: classes, children });
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export { Button };
