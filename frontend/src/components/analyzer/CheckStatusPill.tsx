import type { CheckStatus } from "../../types";
import { CHECK_STATUS_META } from "../../types";

interface CheckStatusPillProps {
  status: CheckStatus;
  compact?: boolean;
}

export default function CheckStatusPill({ status, compact = false }: CheckStatusPillProps) {
  const meta = CHECK_STATUS_META[status] ?? {
    label: status,
    bgClass: "bg-surface-elevated",
    textClass: "text-text-muted",
    borderClass: "border-border-subtle",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-mono font-medium border ${
        meta.bgClass
      } ${meta.textClass} ${meta.borderClass} ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "passed"
            ? "bg-emerald-600 dark:bg-emerald-400"
            : status === "failed"
            ? "bg-rose-600 dark:bg-rose-400"
            : status === "inconclusive"
            ? "bg-amber-600 dark:bg-amber-400"
            : "bg-zinc-500 dark:bg-zinc-400"
        }`}
        aria-hidden="true"
      />
      <span>{meta.label}</span>
    </span>
  );
}
