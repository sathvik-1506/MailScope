import type { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  id?: string;
  /** Dark surface (default) or light surface */
  surface?: "dark" | "light" | "elevated";
  className?: string;
}

const surfaceStyles = {
  dark:     "bg-surface-primary text-text-primary",
  elevated: "bg-surface-secondary text-text-primary",
  light:    "bg-surface-light text-text-inverse",
} as const;

/**
 * Page-level section wrapper.
 * Provides consistent horizontal padding, vertical spacing, and max-width.
 */
export default function Section({
  children,
  id,
  surface = "dark",
  className = "",
}: SectionProps) {
  return (
    <section
      id={id}
      className={`px-5 py-section sm:px-8 lg:px-12 ${surfaceStyles[surface]} ${className}`}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}
