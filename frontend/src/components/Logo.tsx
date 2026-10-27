import { Link } from "react-router-dom";
import { BRAND } from "../constants/brand";

/**
 * Mailora brand mark icon:
 * A clean email-orbit mark integrating an envelope core with orbital signal rings and beacon telemetry.
 */
export function MailoraMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mailora-grad-primary" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="mailora-grad-orbit" x1="3" y1="16" x2="29" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>

      {/* Orbit path encircling the mail core */}
      <ellipse
        cx="16"
        cy="16"
        rx="13.5"
        ry="6"
        transform="rotate(-26 16 16)"
        stroke="url(#mailora-grad-orbit)"
        strokeWidth="1.5"
        strokeDasharray="26 3 4 2"
        opacity="0.9"
      />

      {/* Central Envelope Geometry */}
      <rect
        x="7.5"
        y="10"
        width="17"
        height="12"
        rx="2.5"
        fill="#0d1424"
        stroke="url(#mailora-grad-primary)"
        strokeWidth="1.75"
      />
      {/* Envelope Flap */}
      <path
        d="M8.2 11.2L16 17.2L23.8 11.2"
        stroke="url(#mailora-grad-primary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Signal telemetry waves emanating */}
      <path
        d="M21 7.2A6.5 6.5 0 0 1 25.2 11"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M23.5 4.8A10 10 0 0 1 28.5 10.2"
        stroke="#818cf8"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Orbiting Signal Beacon Node */}
      <circle cx="26.2" cy="11.2" r="1.8" fill="#38bdf8" />
      <circle cx="26.2" cy="11.2" r="3" stroke="#38bdf8" strokeWidth="0.6" opacity="0.6" />
    </svg>
  );
}

/**
 * Brand logo with email-orbit mark.
 * Used in Navbar, AnalyzerHeader, and Footer. Links back to `/`.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2.5 text-text-primary no-underline group ${className}`}
      aria-label={`${BRAND.name} — return to home`}
    >
      <div className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
        <MailoraMark className="h-7 w-7 text-brand-400" />
      </div>
      <span className="text-xl font-bold tracking-tight">
        Mail<span className="text-brand-400">ora</span>
      </span>
    </Link>
  );
}
