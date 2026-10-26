import { Link } from "react-router-dom";
import { Radar } from "lucide-react";

/**
 * Brand logo with icon.
 * Used in Navbar and Footer. Links back to `/`.
 */
export default function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 text-text-primary no-underline group"
      aria-label="MailScope — return to home"
    >
      <Radar
        className="h-7 w-7 text-brand-400 transition-transform duration-300 group-hover:rotate-45"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="text-xl font-bold tracking-tight">
        Mail<span className="text-brand-400">Scope</span>
      </span>
    </Link>
  );
}
