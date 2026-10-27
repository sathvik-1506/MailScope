import { useMemo } from "react";
import {
  BarChart3,
  XCircle,
  HelpCircle,
  MailCheck,
  Globe,
  Cpu,
  Layers,
  TrendingUp,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import Button from "../components/Button";

export default function AnalyticsPage() {
  const { results, batchHistory } = useAnalysis();

  // Combine active results with all session batches to get comprehensive telemetry
  const allRecords = useMemo(() => {
    if (results.length > 0) return results;
    return batchHistory.flatMap((b) => b.results);
  }, [results, batchHistory]);

  const total = allRecords.length;
  const delivered = allRecords.filter((r) => r.verdict === "likely_delivered").length;
  const bounce = allRecords.filter((r) => r.verdict === "likely_bounce").length;
  const unknown = allRecords.filter((r) => r.verdict === "unknown").length;

  const deliveredPct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const bouncePct = total > 0 ? Math.round((bounce / total) * 100) : 0;
  const unknownPct = total > 0 ? Math.round((unknown / total) * 100) : 0;

  // Domain Distribution Analysis
  const domainBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; delivered: number; bounce: number; unknown: number }>();

    allRecords.forEach((r) => {
      const parts = r.address.split("@");
      const domain = parts.length > 1 ? parts[1].toLowerCase() : "unknown-domain";
      const existing = map.get(domain) ?? { total: 0, delivered: 0, bounce: 0, unknown: 0 };
      existing.total += 1;
      if (r.verdict === "likely_delivered") existing.delivered += 1;
      else if (r.verdict === "likely_bounce") existing.bounce += 1;
      else existing.unknown += 1;
      map.set(domain, existing);
    });

    return Array.from(map.entries())
      .map(([domain, stats]) => ({ domain, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8); // Top 8 domains
  }, [allRecords]);

  // Pipeline Check telemetry
  const pipelineStats = useMemo(() => {
    let syntaxPassed = 0;
    let dnsPassed = 0;
    let smtpProbed = 0;
    let smtpAccepted = 0;

    allRecords.forEach((r) => {
      const syntax = r.checks.find((c) => c.id === "syntax");
      const dns = r.checks.find((c) => c.id === "dns_mx");
      const smtp = r.checks.find((c) => c.id === "smtp_handshake");

      if (syntax?.status === "passed") syntaxPassed += 1;
      if (dns?.status === "passed") dnsPassed += 1;
      if (smtp && smtp.status !== "skipped") {
        smtpProbed += 1;
        if (smtp.status === "passed") smtpAccepted += 1;
      }
    });

    return {
      syntaxPassRate: total > 0 ? Math.round((syntaxPassed / total) * 100) : 0,
      dnsPassRate: total > 0 ? Math.round((dnsPassed / total) * 100) : 0,
      smtpProbedCount: smtpProbed,
      smtpAcceptRate: smtpProbed > 0 ? Math.round((smtpAccepted / smtpProbed) * 100) : 0,
    };
  }, [allRecords, total]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Deep Telemetry
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Deliverability Analytics
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            Aggregate health ratios, domain distributions, and pipeline step telemetry derived from verified address batches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button to="/app/analyze" size="sm">
            <MailCheck className="h-4 w-4 mr-1.5" />
            <span>Analyze New Batch</span>
          </Button>
        </div>
      </div>

      {total === 0 ? (
        /* Empty state when no batches analyzed */
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            No Telemetry Available Yet
          </h3>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Run an analysis batch in the workspace to automatically calculate deliverability ratios, domain breakdowns, and verification stage latencies.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <MailCheck className="h-4 w-4 mr-2" />
              <span>Go to Analyze Emails</span>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 2. Top Ratio KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Total Addresses</span>
                <Layers className="h-4 w-4 text-text-muted" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-text-primary">{total}</span>
                <span className="text-xs text-text-muted font-mono">{domainBreakdown.length} domains</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Total records in active session</p>
            </div>

            <div className="rounded-xl border border-delivered/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Viability Ratio</span>
                <TrendingUp className="h-4 w-4 text-delivered" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-delivered">{deliveredPct}%</span>
                <span className="text-xs font-mono text-text-muted">{delivered} passed</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Addresses likely to reach destination</p>
            </div>

            <div className="rounded-xl border border-bounce/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Bounce Probability</span>
                <XCircle className="h-4 w-4 text-bounce" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-bounce">{bouncePct}%</span>
                <span className="text-xs font-mono text-text-muted">{bounce} rejected</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Addresses with fatal delivery impediments</p>
            </div>

            <div className="rounded-xl border border-unknown/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Inconclusive Rate</span>
                <HelpCircle className="h-4 w-4 text-unknown" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-unknown">{unknownPct}%</span>
                <span className="text-xs font-mono text-text-muted">{unknown} indeterminate</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Temporary timeouts or greylisting</p>
            </div>
          </div>

          {/* 3. Classification Distribution Bar */}
          <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Verdict Classification Proportions
              </h2>
              <span className="text-xs font-mono text-text-muted">
                100% of analyzed data ({total} addresses)
              </span>
            </div>

            {/* Visual stacked bar */}
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-elevated">
              {deliveredPct > 0 && (
                <div
                  style={{ width: `${deliveredPct}%` }}
                  className="bg-delivered transition-all duration-500"
                  title={`Likely Delivered: ${delivered} (${deliveredPct}%)`}
                />
              )}
              {bouncePct > 0 && (
                <div
                  style={{ width: `${bouncePct}%` }}
                  className="bg-bounce transition-all duration-500"
                  title={`Likely Bounce: ${bounce} (${bouncePct}%)`}
                />
              )}
              {unknownPct > 0 && (
                <div
                  style={{ width: `${unknownPct}%` }}
                  className="bg-unknown transition-all duration-500"
                  title={`Unknown: ${unknown} (${unknownPct}%)`}
                />
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-6 pt-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-delivered" />
                <span className="text-text-secondary">Likely Delivered ({deliveredPct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-bounce" />
                <span className="text-text-secondary">Likely Bounce ({bouncePct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-unknown" />
                <span className="text-text-secondary">Unknown ({unknownPct}%)</span>
              </div>
            </div>
          </div>

          {/* 4. Domain Distribution & Pipeline Integrity Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top Domains Table */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Top Domain Distribution
                  </h2>
                </div>
                <span className="text-xs text-text-muted">Ranked by volume</span>
              </div>

              <div className="divide-y divide-border-subtle">
                {domainBreakdown.map((item) => (
                  <div key={item.domain} className="flex items-center justify-between py-2.5 text-xs">
                    <span className="font-mono text-text-primary font-medium truncate max-w-[180px]">
                      {item.domain}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-text-muted">
                        {item.total} {item.total === 1 ? "addr" : "addrs"}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-delivered">{item.delivered}✓</span>
                        <span className="text-bounce">{item.bounce}✗</span>
                        <span className="text-unknown">{item.unknown}?</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Stage Health */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Verification Pipeline Health
                  </h2>
                </div>
                <span className="text-xs text-text-muted">Stage pass rates</span>
              </div>

              <div className="space-y-4 pt-1">
                {/* Syntax Stage */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary font-medium">RFC Syntax Conformance</span>
                    <span className="font-mono text-text-primary font-semibold">
                      {pipelineStats.syntaxPassRate}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      style={{ width: `${pipelineStats.syntaxPassRate}%` }}
                      className="h-full bg-brand-500 rounded-full"
                    />
                  </div>
                </div>

                {/* DNS MX Stage */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary font-medium">DNS MX Target Resolution</span>
                    <span className="font-mono text-text-primary font-semibold">
                      {pipelineStats.dnsPassRate}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      style={{ width: `${pipelineStats.dnsPassRate}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>

                {/* SMTP Probing Stage */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary font-medium">SMTP Handshake Acceptance</span>
                    <span className="font-mono text-text-primary font-semibold">
                      {pipelineStats.smtpProbedCount > 0 ? `${pipelineStats.smtpAcceptRate}%` : "Not probed in current run"}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      style={{ width: `${pipelineStats.smtpAcceptRate}%` }}
                      className="h-full bg-indigo-500 rounded-full"
                    />
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    {pipelineStats.smtpProbedCount} addresses were probed with safe opt-in SMTP handshakes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
