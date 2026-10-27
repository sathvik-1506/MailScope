import { useNavigate, Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  MailCheck,
  BarChart3,
  History,
  Download,
  ShieldCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { useAnalysis, type AnalysisBatchRecord } from "../context/AnalysisContext";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { BRAND } from "../constants/brand";

export default function OverviewPage() {
  const { results, batchHistory, setResults } = useAnalysis();
  const navigate = useNavigate();

  // Compute genuine aggregate metrics across all batches or active workspace results
  const hasHistory = batchHistory.length > 0;
  const hasActiveResults = results.length > 0;

  const totalAnalyzed = hasHistory
    ? batchHistory.reduce((acc, b) => acc + b.addressesCount, 0)
    : hasActiveResults
    ? results.length
    : 0;

  const delivered = hasHistory
    ? batchHistory.reduce((acc, b) => acc + b.deliveredCount, 0)
    : hasActiveResults
    ? results.filter((r) => r.verdict === "likely_delivered").length
    : 0;

  const bounce = hasHistory
    ? batchHistory.reduce((acc, b) => acc + b.bounceCount, 0)
    : hasActiveResults
    ? results.filter((r) => r.verdict === "likely_bounce").length
    : 0;

  const unknown = hasHistory
    ? batchHistory.reduce((acc, b) => acc + b.unknownCount, 0)
    : hasActiveResults
    ? results.filter((r) => r.verdict === "unknown").length
    : 0;

  const runsCount = hasHistory ? batchHistory.length : hasActiveResults ? 1 : 0;

  const deliveredPct = totalAnalyzed > 0 ? Math.round((delivered / totalAnalyzed) * 100) : 0;
  const bouncePct = totalAnalyzed > 0 ? Math.round((bounce / totalAnalyzed) * 100) : 0;
  const unknownPct = totalAnalyzed > 0 ? Math.max(0, 100 - deliveredPct - bouncePct) : 0;

  const handleInspectBatch = (batch: AnalysisBatchRecord) => {
    if (batch.hasDetailedResults && batch.results && batch.results.length > 0) {
      setResults(batch.results);
      navigate("/app/analyze");
    } else {
      navigate("/app/history");
    }
  };

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
            {BRAND.positioning} Review genuine aggregate metrics, verdict distributions, and previous verification runs.
          </p>
        </div>

        {/* Primary Action Button */}
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
            <span className="text-xs font-medium text-text-secondary">Total Addresses</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono tracking-tight text-text-primary">
              {totalAnalyzed}
            </span>
            <span className="text-xs text-text-muted font-mono">
              {runsCount} {runsCount === 1 ? "run" : "runs"}
            </span>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {totalAnalyzed > 0 ? "Evaluated in retained workspace ledger" : "No addresses evaluated yet"}
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
              <span className="text-xs font-mono font-semibold text-delivered">
                {deliveredPct}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">RFC valid, active DNS MX & confirmed mailboxes</p>
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
              <span className="text-xs font-mono font-semibold text-bounce">
                {bouncePct}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">Bad syntax, NXDOMAIN or 5xx rejection</p>
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
              <span className="text-xs font-mono font-semibold text-unknown">
                {unknownPct}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">DNS timeouts, greylisting or port 25 blocks</p>
        </div>
      </div>

      {/* 3. Verdict Distribution Visualizer */}
      {totalAnalyzed > 0 && (
        <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Aggregate Verdict Distribution
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Proportional breakdown of verification verdicts across all evaluated addresses.
              </p>
            </div>
            <Link
              to="/app/analytics"
              className="text-xs font-medium text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 transition-colors"
            >
              <span>Explore Analytics</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Accessible Stacked Bar */}
          <div
            role="img"
            aria-label={`Verdict breakdown: ${delivered} delivered (${deliveredPct}%), ${bounce} bounce (${bouncePct}%), ${unknown} unknown (${unknownPct}%)`}
            className="h-4 w-full rounded-full bg-surface-elevated overflow-hidden flex shadow-inner border border-border-subtle"
          >
            {deliveredPct > 0 && (
              <div
                style={{ width: `${deliveredPct}%` }}
                className="bg-emerald-500 hover:opacity-90 transition-all duration-300"
                title={`Likely Delivered: ${delivered} (${deliveredPct}%)`}
              />
            )}
            {bouncePct > 0 && (
              <div
                style={{ width: `${bouncePct}%` }}
                className="bg-rose-500 hover:opacity-90 transition-all duration-300"
                title={`Likely Bounce: ${bounce} (${bouncePct}%)`}
              />
            )}
            {unknownPct > 0 && (
              <div
                style={{ width: `${unknownPct}%` }}
                className="bg-amber-500 hover:opacity-90 transition-all duration-300"
                title={`Unknown: ${unknown} (${unknownPct}%)`}
              />
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <span>
                Delivered: <strong className="text-text-primary font-mono">{delivered}</strong> ({deliveredPct}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
              <span>
                Bounce: <strong className="text-text-primary font-mono">{bounce}</strong> ({bouncePct}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
              <span>
                Unknown: <strong className="text-text-primary font-mono">{unknown}</strong> ({unknownPct}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Quick Links Navigation Grid (4 Key Workspaces) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Analyze Emails */}
        <Link
          to="/app/analyze"
          className="group rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card hover:border-brand-500/40 hover:bg-surface-elevated/70 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <MailCheck className="h-4 w-4" />
              </div>
              <Sparkles className="h-3.5 w-3.5 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h3 className="text-sm font-bold text-text-primary group-hover:text-brand-400 transition-colors">
              Analyze Emails
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Verify address lists manually or extract candidates from .csv, .txt, .pdf, .docx, and .eml documents.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center text-xs font-medium text-brand-400">
            <span>Open Analyzer</span>
            <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 2. Export Center */}
        <Link
          to="/app/exports"
          className="group rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card hover:border-brand-500/40 hover:bg-surface-elevated/70 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary border border-border-subtle">
                <Download className="h-4 w-4 text-brand-400" />
              </div>
            </div>
            <h3 className="text-sm font-bold text-text-primary group-hover:text-brand-400 transition-colors">
              Export Center
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Download sanitized CSV reports protected against formula injection (CWE-1236) with custom column options.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center text-xs font-medium text-brand-400">
            <span>Export Reports</span>
            <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 3. Analytics */}
        <Link
          to="/app/analytics"
          className="group rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card hover:border-brand-500/40 hover:bg-surface-elevated/70 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary border border-border-subtle">
                <BarChart3 className="h-4 w-4 text-brand-400" />
              </div>
            </div>
            <h3 className="text-sm font-bold text-text-primary group-hover:text-brand-400 transition-colors">
              Analytics
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Inspect technical dataset composition, domain rankings, mail provider infrastructure, and routing telemetry.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center text-xs font-medium text-brand-400">
            <span>View Telemetry</span>
            <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 4. History */}
        <Link
          to="/app/history"
          className="group rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card hover:border-brand-500/40 hover:bg-surface-elevated/70 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary border border-border-subtle">
                <History className="h-4 w-4 text-brand-400" />
              </div>
            </div>
            <h3 className="text-sm font-bold text-text-primary group-hover:text-brand-400 transition-colors">
              Analysis History
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Audit previous verification batches, search by domain metadata, manage retention, or re-inspect evidence.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center text-xs font-medium text-brand-400">
            <span>Browse History</span>
            <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* 5. Recent Analysis Activity Section */}
      <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4 bg-surface-elevated/40">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Recent Analysis Activity
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Chronological log of batch verifications executed across your workspace.
            </p>
          </div>
          {batchHistory.length > 0 && (
            <Link
              to="/app/history"
              className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
            >
              <span>View all ({batchHistory.length})</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {batchHistory.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
              <Clock className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">
              No Analysis Activity Yet
            </h3>
            <p className="mt-1.5 text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
              Welcome to Mailora! Every address batch you verify is automatically cataloged with privacy-conscious telemetry. Start with manual input or upload a document to begin.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button to="/app/analyze" size="md">
                <MailCheck className="h-4 w-4 mr-2" />
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
                    <span className="font-semibold text-xs text-text-primary">
                      {batch.title}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted">
                      {new Date(batch.timestamp).toLocaleDateString()}{" "}
                      {new Date(batch.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {batch.smtpProbed && (
                      <span className="rounded bg-brand-500/10 px-1.5 py-0.2 text-[10px] font-mono text-brand-400 border border-brand-500/20">
                        SMTP
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span className="font-mono text-text-muted">{batch.id}</span>
                    <span>•</span>
                    <span>{batch.addressesCount} {batch.addressesCount === 1 ? "address" : "addresses"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Badge color="delivered">{batch.deliveredCount}</Badge>
                    <Badge color="bounce">{batch.bounceCount}</Badge>
                    <Badge color="unknown">{batch.unknownCount}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectBatch(batch)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-subtle bg-surface-primary text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Trust & Methodology Footer Note */}
      <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-secondary/60 p-4 text-xs text-text-muted">
        <ShieldCheck className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {BRAND.name} operates statelessly without permanent server-side address storage. All evaluations test RFC conformance and authoritative DNS nameservers without sending message bodies.
        </p>
      </div>
    </div>
  );
}
