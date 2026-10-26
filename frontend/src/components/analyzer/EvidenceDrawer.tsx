import { useEffect } from "react";
import {
  X,
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import type { DetailedAddressResult } from "../../types";
import { VERDICT_META } from "../../types";
import Badge from "../Badge";
import CheckStatusPill from "./CheckStatusPill";

interface EvidenceDrawerProps {
  result: DetailedAddressResult | null;
  onClose: () => void;
}

export default function EvidenceDrawer({ result, onClose }: EvidenceDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!result) return null;

  const verdictMeta = VERDICT_META[result.verdict];
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-xl flex-col bg-surface-secondary border-l border-border-default shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-secondary/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs uppercase font-mono tracking-widest text-text-muted">
                  Evidence Ledger
                </span>
                {result.isFixture ? (
                  <span className="inline-flex items-center gap-1 rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-400 border border-brand-500/20">
                    <Sparkles className="h-3 w-3" />
                    RFC 2606 Fixture
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="h-3 w-3" />
                    Live Technical Analysis
                  </span>
                )}
              </div>
              <h2
                id="drawer-title"
                className="text-lg font-mono font-bold text-text-primary break-all"
              >
                {result.address}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              aria-label="Close evidence ledger"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Verdict Banner */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-primary p-3">
            <div className="flex items-center gap-2.5">
              <Badge color={verdictMeta.badgeColor}>{verdictMeta.label}</Badge>
              <span className="text-xs text-text-secondary">
                Confidence: <strong className="font-mono text-text-primary">{confidencePct}%</strong>
              </span>
            </div>
            <div className="text-[11px] text-text-muted">
              {result.analysedAt ? new Date(result.analysedAt).toLocaleTimeString() : "Just now"}
            </div>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 space-y-6 p-6">
          {/* Primary Reason */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
              Primary Assessment
            </h3>
            <p className="rounded-lg border border-border-subtle bg-surface-primary/60 p-3.5 text-sm leading-relaxed text-text-secondary">
              {result.reason}
            </p>
          </div>

          {/* Check Pipeline (Passed, Failed, Inconclusive, Skipped, Unavailable) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Pipeline Checks ({result.checks.length})
              </h3>
              <span className="text-[11px] text-text-muted">
                RFC 5321 &bull; DNS &bull; SMTP Handshake
              </span>
            </div>

            <div className="space-y-2.5">
              {result.checks.map((chk) => (
                <div
                  key={chk.id}
                  className="rounded-lg border border-border-subtle bg-surface-primary p-3.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-text-primary">
                      {chk.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {chk.latencyMs !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted">
                          <Clock className="h-3 w-3" />
                          {chk.latencyMs}ms
                        </span>
                      )}
                      <CheckStatusPill status={chk.status} compact />
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {chk.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Supporting Evidence */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileCheck2 className="h-4 w-4 text-brand-400" aria-hidden="true" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Supporting Technical Evidence
              </h3>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-primary/60 p-4">
              <ul className="space-y-2 text-xs leading-relaxed text-text-secondary">
                {result.evidence.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-brand-400 font-mono mt-0.5">›</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Known Limitations */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
                Known Limitations & Caveats
              </h3>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <ul className="space-y-2 text-xs leading-relaxed text-text-secondary">
                {result.limitations.map((lim, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-400 font-mono mt-0.5">›</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Verification Disclaimer */}
          <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-4 text-xs text-text-muted flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 shrink-0 text-text-secondary mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              MailScope tests technical evidence without sending email. SMTP acceptance indicates the server acknowledged the recipient during the handshake, but final delivery can still depend on internal mailbox policies or greylisting filters.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="sticky bottom-0 border-t border-border-subtle bg-surface-secondary px-6 py-4 flex items-center justify-between">
          <span className="text-xs font-mono text-text-muted">
            ID: {result.id}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-card transition-colors cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
