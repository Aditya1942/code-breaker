"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CODE_LENGTH } from "@/lib/game";

// One 4-cell code input, reused for secret entry (masked) and guesses.
// Auto-advance on type, backspace moves back, digits only.
function DigitInput({
  value,
  onChange,
  onSubmit,
  masked = false,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  masked?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const setCell = (i: number, ch: string) => {
    const next = cells.slice();
    next[i] = ch;
    onChange(next.join("").slice(0, CODE_LENGTH));
  };

  return (
    <div
      className="flex justify-center gap-2"
      role="group"
      aria-label={label}
    >
      {cells.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={ch}
          disabled={disabled}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label} digit ${i + 1}`}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, "").slice(-1);
            setCell(i, digit);
            if (digit && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !ch && i > 0) {
              refs.current[i - 1]?.focus();
            }
            if (e.key === "Enter") onSubmit?.();
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            "size-12 rounded-lg border-2 bg-card text-center font-mono text-xl font-bold",
            "shadow-[2px_2px_0_var(--border)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            "disabled:pointer-events-none disabled:opacity-50",
            ch && !masked && "bg-tile",
          )}
        />
      ))}
    </div>
  );
}

export { DigitInput };
