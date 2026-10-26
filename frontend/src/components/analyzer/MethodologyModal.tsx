import { useEffect } from "react";
import { X, ShieldAlert, Cpu, Globe, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MethodologyModal({ isOpen, onClose }: MethodologyModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-border-default bg-surface-secondary shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4 mb-6">
          <div>
            <h2 id="methodology-title" className="text-xl font-bold tracking-tight text-text-primary">
              MailScope Verification Methodology
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Transparent, evidence-based deliverability intelligence without false certainty.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          {/* Verdicts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              The Three Core Verdicts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-delivered/20 bg-delivered/5">
                <div className="flex items-center gap-1.5 text-delivered font-semibold text-xs mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Likely Delivered
                </div>
                <p className="text-[11px] text-text-muted">
                  RFC syntax valid, DNS MX resolved, and (if probed) SMTP RCPT accepted.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-bounce/20 bg-bounce/5">
                <div className="flex items-center gap-1.5 text-bounce font-semibold text-xs mb-1">
                  <XCircle className="h-4 w-4" />
                  Likely Bounce
                </div>
                <p className="text-[11px] text-text-muted">
                  Invalid syntax, non-existent domain (NXDOMAIN), or explicit SMTP 5xx rejection.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-unknown/20 bg-unknown/5">
                <div className="flex items-center gap-1.5 text-unknown font-semibold text-xs mb-1">
                  <HelpCircle className="h-4 w-4" />
                  Unknown
                </div>
                <p className="text-[11px] text-text-muted">
                  DNS timeout, greylisting (451), port 25 block, or inconclusive response.
                </p>
              </div>
            </div>
          </div>

          {/* Verification Pillars */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Technical Verification Signals
            </h3>

            <div className="flex gap-3">
              <Cpu className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-text-primary text-xs">RFC 5321 & 5322 Syntax Rules</h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Validates characters, length limits, domain labels, and quote rules. Malformed addresses fail before wasting network calls.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Globe className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-text-primary text-xs">DNS & MX Host Resolution</h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Queries authoritative DNS records for MX targets with standard RFC A/AAAA fallback handling. Detects missing zones and timeouts.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <ShieldAlert className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-text-primary text-xs">Non-Disruptive SMTP Probing</h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Optional SMTP probe connects and issues EHLO/HELO and MAIL FROM/RCPT TO, terminating with QUIT. No email data or subject lines are ever sent.
                </p>
              </div>
            </div>
          </div>

          {/* Limitations */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
            <h4 className="font-semibold text-amber-400 mb-1.5">Fundamental Constraints</h4>
            <ul className="space-y-1.5 text-text-muted">
              <li>&bull; Mailbox existence cannot be guaranteed without delivering a message.</li>
              <li>&bull; Catch-all domains accept all recipient addresses indiscriminately.</li>
              <li>&bull; Blocked outbound port 25 connections are treated as inconclusive, not failures.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-elevated px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-card transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
