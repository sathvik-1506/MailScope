import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  MailCheck,
  BarChart3,
  History,
  ShieldCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { BRAND } from "../constants/brand";

export default function OverviewPage() {
  const { results, batchHistory } = useAnalysis();

  // Compute aggregate stats across current session
  const totalInSession = batchHistory.reduce((acc, b) => acc + b.addressesCount, 0);
  const totalAnalyzed = results.length > 0 ? results.length : totalInSession;

  const delivered = results.length > 0
    ? results.filter((r) => r.verdict === "likely_delivered").length
    : batchHistory.reduce((acc, b) => acc + b.deliveredCount, 0);

  const bounce = results.length > 0
    ? results.filter((r) => r.verdict === "likely_bounce").length
    : batchHistory.reduce((acc, b) => acc + b.bounceCount, 0);

  const unknown = results.length > 0
    ? results.filter((r) => r.verdict === "unknown").length
    : batchHistory.reduce((acc, b) => acc + b.unknownCount, 0);

  const deliverabilityRate = totalAnalyzed > 0 ? Math.round((delivered / totalAnalyzed) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Workspace Overview
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Deliverability Intelligence Hub
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            {BRAND.positioning} Review aggregate metrics, recent batch results, and quick actions.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <Button to="/app/analyze" size="md">
            <MailCheck className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>Analyze Emails</span>
          </Button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Analyzed */}
        <div className="rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Total Analyzed</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono tracking-tight text-text-primary">
              {totalAnalyzed}
            </span>
            <span className="text-xs text-text-muted">
              {batchHistory.length} {batchHistory.length === 1 ? "run" : "runs"}
            </span>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {totalAnalyzed > 0 ? "Processed in active session" : "No addresses evaluated yet"}
          </p>
        </div>

        {/* Likely Delivered */}
        <div className="rounded-xl border border-delivered/30 bg-surface-secondary p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Likely Delivered</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-delivered/10 text-delivered">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono tracking-tight text-delivered">
              {delivered}
            </span>
            {totalAnalyzed > 0 && (
              <span className="text-xs font-mono text-delivered">
                {deliverabilityRate}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">RFC valid, DNS routing & confirmed mailboxes</p>
        </div>

        {/* Likely Bounce */}
        <div className="rounded-xl border border-bounce/30 bg-surface-secondary p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Likely Bounce</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bounce/10 text-bounce">
              <XCircle className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono tracking-tight text-bounce">
              {bounce}
            </span>
            {totalAnalyzed > 0 && (
              <span className="text-xs font-mono text-bounce">
                {Math.round((bounce / totalAnalyzed) * 100)}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">Bad syntax, NXDOMAIN or explicit 5xx rejection</p>
        </div>

        {/* Unknown */}
        <div className="rounded-xl border border-unknown/30 bg-surface-secondary p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Unknown</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-unknown/10 text-unknown">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono tracking-tight text-unknown">
              {unknown}
            </span>
            {totalAnalyzed > 0 && (
              <span className="text-xs font-mono text-unknown">
                {Math.round((unknown / totalAnalyzed) * 100)}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">DNS timeouts, greylisting or port 25 blocks</p>
        </div>
      </div>

      {/* 3. Quick Action & Primary Features Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fast Action Card */}
        <div className="rounded-xl border border-brand-500/30 bg-surface-secondary p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="h-4 w-4" />
              <span>Quick Action</span>
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              Verify an Email Batch
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Input up to 100 email addresses for simultaneous RFC syntax testing, live DNS MX lookup, and non-disruptive SMTP handshake probing.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border-subtle flex flex-col sm:flex-row gap-3">
            <Button to="/app/analyze" size="sm" className="w-full justify-center">
              <span>Open Analyzer</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Analytics Card */}
        <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              <BarChart3 className="h-4 w-4 text-brand-400" />
              <span>Deep Signals</span>
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              Deliverability Analytics
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Explore domain distributions, pipeline check latencies, and syntax vs network failure ratios across all analyzed batches.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border-subtle">
            <Link
              to="/app/analytics"
              className="inline-flex items-center text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
              <span>View Analytics & Charts</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </div>
        </div>

        {/* History Card */}
        <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              <History className="h-4 w-4 text-brand-400" />
              <span>Session Log</span>
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              Batch History
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Review prior verification runs from this session, inspect full technical evidence ledgers, and export sanitized CSV reports.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border-subtle">
            <Link
              to="/app/history"
              className="inline-flex items-center text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
              <span>Browse History Ledger</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Recent Analysis Activity Section */}
      <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4 bg-surface-elevated/40">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Recent Analysis Activity
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Chronological log of batch verifications executed during this session.
            </p>
          </div>
          {batchHistory.length > 0 && (
            <Link
              to="/app/history"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View all ({batchHistory.length})
            </Link>
          )}
        </div>

        {batchHistory.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-elevated text-text-muted mb-3 border border-border-subtle">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">
              No verification activity recorded yet
            </h3>
            <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
              Ready to verify deliverability? Run an email batch to populate real-time activity and aggregate telemetry.
            </p>
            <div className="mt-5">
              <Button to="/app/analyze" size="sm">
                <span>Start Your First Analysis</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {batchHistory.slice(0, 5).map((batch) => (
              <div
                key={batch.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-surface-elevated/40 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-semibold text-text-primary">
                      {batch.title}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {new Date(batch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {batch.smtpProbed && (
                      <span className="rounded bg-brand-500/10 px-1.5 py-0.2 text-[10px] font-mono text-brand-400 border border-brand-500/20">
                        SMTP Probed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {batch.addressesCount} {batch.addressesCount === 1 ? "address" : "addresses"} evaluated
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Badge color="delivered">{batch.deliveredCount} Delivered</Badge>
                    <Badge color="bounce">{batch.bounceCount} Bounce</Badge>
                    <Badge color="unknown">{batch.unknownCount} Unknown</Badge>
                  </div>
                  <Button to="/app/analyze" variant="ghost" size="sm">
                    <span>Inspect</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Trust & Methodology Footer Note */}
      <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-secondary/60 p-4 text-xs text-text-muted">
        <ShieldCheck className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {BRAND.name} operates statelessly without permanent address storage. All evaluations test RFC conformance and authoritative DNS nameservers without sending message bodies.
        </p>
      </div>
    </div>
  );
}
