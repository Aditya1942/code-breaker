import { cn } from "@/lib/utils";

// Room key rendered as board-game letter tiles — staggered pop-in.
function KeyTiles({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex gap-1.5", className)} aria-label={value}>
      {value.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="flex size-8 items-center justify-center rounded-lg border-2 bg-tile font-mono text-base font-bold shadow-[2px_2px_0_var(--border)] animate-tile-pop"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export { KeyTiles };
