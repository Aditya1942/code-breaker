import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-2xl border-2 bg-card py-6 shadow-[6px_6px_0_var(--border)] animate-tile-pop",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-1.5 px-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-display text-2xl font-black leading-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-6", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
