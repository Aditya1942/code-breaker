import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("font-display text-sm font-bold", className)}
      {...props}
    />
  );
}

export { Label };
