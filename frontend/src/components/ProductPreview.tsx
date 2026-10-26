import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../components";

/* ------------------------------------------------------------------ */
/* Illustrative preview data                                           */
/*                                                                     */
/* Clearly labeled as a preview — these are not live results.          */
/* ------------------------------------------------------------------ */
const PREVIEW_ROWS: PreviewRow[] = [
  {
    address: "alice@acmecorp.com",
    verdict: "likely_delivered",
    confidence: 0.87,
    evidence: [
      "Address passes RFC 5321 syntax checks.",
      "DNS: Found 2 MX record(s): mx1.acmecorp.com, mx2.acmecorp.com",
    ],
    limitations: [
      "Mailbox existence unconfirmed — SMTP verification was not enabled.",
      "SMTP RCPT TO acceptance does not guarantee delivery; some servers accept all addresses (catch-all).",
    ],
  },
  {
    address: "bob@nonexist.invalid",
    verdict: "likely_bounce",
    confidence: 0.92,
    evidence: [
      "Address passes RFC 5321 syntax checks.",
      "DNS: Domain 'nonexist.invalid' does not exist (NXDOMAIN).",
    ],
    limitations: [
      "DNS propagation delays may cause false negatives.",
    ],
  },
  {
    address: "carol@timeout-mail.example",
    verdict: "unknown",
    confidence: 0.35,
    evidence: [
      "Address passes RFC 5321 syntax checks.",
      "DNS inconclusive: DNS query timed out — result is inconclusive.",
    ],
    limitations: [
      "DNS result was inconclusive; verdict may change once DNS is reachable.",
    ],
  },
];

interface PreviewRow {
  address: string;
  verdict: "likely_delivered" | "likely_bounce" | "unknown";
  confidence: number;
  evidence: string[];
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */
function VerdictIcon({ verdict }: { verdict: PreviewRow["verdict"] }) {
  switch (verdict) {
    case "likely_delivered":
      return <CheckCircle2 className="h-4 w-4 text-delivered" aria-hidden="true" />;
    case "likely_bounce":
      return <XCircle className="h-4 w-4 text-bounce" aria-hidden="true" />;
    case "unknown":
      return <HelpCircle className="h-4 w-4 text-unknown" aria-hidden="true" />;
  }
}

function VerdictLabel({ verdict }: { verdict: PreviewRow["verdict"] }) {
  const map = {
    likely_delivered: { label: "Likely Delivered", color: "delivered" as const },
    likely_bounce:    { label: "Likely Bounce",    color: "bounce" as const },
    unknown:          { label: "Unknown",          color: "unknown" as const },
  };
  const m = map[verdict];
  return <Badge color={m.color}>{m.label}</Badge>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2" aria-label={`Confidence ${pct}%`}>
      <div className="h-1.5 w-16 rounded-full bg-surface-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted font-mono">{pct}%</span>
    </div>
  );
}

function EvidencePanel({ row }: { row: PreviewRow }) {
  return (
    <div className="space-y-3 px-4 pb-4 pt-1 text-sm animate-in">
      <div>
        <p className="font-medium text-text-secondary mb-1.5">Evidence</p>
        <ul className="space-y-1 text-text-muted">
          {row.evidence.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand-400 mt-0.5 shrink-0">›</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-text-secondary mb-1.5">Limitations</p>
        <ul className="space-y-1 text-text-muted">
          {row.limitations.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-unknown mt-0.5 shrink-0">›</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PreviewRowItem({ row }: { row: PreviewRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-elevated/50 transition-colors cursor-pointer"
        aria-expanded={expanded}
        aria-label={`${row.address} — ${row.verdict.replace("_", " ")}. Click to ${expanded ? "collapse" : "expand"} evidence.`}
      >
        <VerdictIcon verdict={row.verdict} />
        <span className="flex-1 font-mono text-sm text-text-primary truncate">
          {row.address}
        </span>
        <VerdictLabel verdict={row.verdict} />
        <ConfidenceBar value={row.confidence} />
        {expanded
          ? <ChevronUp className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
        }
      </button>
      {expanded && <EvidencePanel row={row} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export                                                         */
/* ------------------------------------------------------------------ */

/**
 * Interactive product preview built from real React components.
 * Uses illustrative data clearly labeled as a preview.
 */
export default function ProductPreview() {
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Preview label */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-text-muted font-semibold">
          Product Preview — Illustrative Data
        </p>
        <Badge color="neutral">3 addresses</Badge>
      </div>

      {/* Card */}
      <div className="rounded-lg border border-border-default bg-surface-secondary shadow-card overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 bg-surface-elevated/40">
          <span className="h-2.5 w-2.5 rounded-full bg-bounce/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-unknown/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-delivered/70" />
          <span className="ml-2 text-xs text-text-muted font-mono">
            mailscope analysis
          </span>
        </div>

        {/* Rows */}
        {PREVIEW_ROWS.map((row) => (
          <PreviewRowItem key={row.address} row={row} />
        ))}
      </div>
    </div>
  );
}
