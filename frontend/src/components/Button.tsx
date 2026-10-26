import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Variant map                                                         */
/* ------------------------------------------------------------------ */
const variants = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 shadow-[0_1px_12px_rgba(120,90,255,0.25)]",
  secondary:
    "bg-surface-elevated text-text-primary border border-border-default hover:bg-surface-card hover:border-brand-400/40",
  ghost:
    "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-elevated",
} as const;

const sizes = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-body",
  lg: "px-7 py-3.5 text-body font-semibold",
} as const;

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
interface ButtonProps {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** If set, renders a React Router `<Link>` instead of a `<button>`. */
  to?: string;
  /** If set, renders an `<a>` for in-page scroll anchors. */
  href?: string;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  type?: "button" | "submit" | "reset";
}

/**
 * Design-system button / link.
 *
 * - `to` → React Router client-side navigation
 * - `href` → native anchor (scroll links, external)
 * - neither → `<button>`
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  to,
  href,
  onClick,
  className = "",
  ariaLabel,
  type = "button",
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 cursor-pointer select-none";
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} className={cls} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
