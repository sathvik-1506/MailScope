import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: "delivered" | "bounce" | "unknown" | "neutral";
  className?: string;
}

const colorMap = {
  delivered: "bg-delivered/15 text-delivered border-delivered/25",
  bounce:    "bg-bounce/15 text-bounce border-bounce/25",
  unknown:   "bg-unknown/15 text-unknown border-unknown/25",
  neutral:   "bg-surface-elevated text-text-secondary border-border-subtle",
} as const;

/**
 * Small status badge / pill.
 * Maps to the three verdict categories or a neutral default.
 */
export default function Badge({ children, color = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-tight ${colorMap[color]} ${className}`}
    >
      {children}
    </span>
  );
}
