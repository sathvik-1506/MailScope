import { useState, useMemo } from "react";
import {
  BarChart3,
  XCircle,
  HelpCircle,
  MailCheck,
  Globe,
  Cpu,
  Layers,
  TrendingUp,
  Server,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Filter,
  Info,
  Clock,
  Sparkles,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import Button from "../components/Button";
import {
  calculateProviderDistribution,
  calculateDomainDistribution,
  calculateDnsRoutingStats,
  calculateSmtpCoverageStats,
  calculateDataQualityStats,
  type ProviderStat,
  type DomainStat,
} from "../utils/analyticsTelemetry";
import type { DetailedAddressResult, Verdict } from "../types";

export default function AnalyticsPage() {
  const { results, batchHistory } = useAnalysis();

  // Filters
  const [selectedRunScope, setSelectedRunScope] = useState<string>("all");
  const [selectedVerdictFilter, setSelectedVerdictFilter] = useState<Verdict | "all">("all");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>("all");

  // Build list of selectable runs from workspace & session history
  const availableRuns = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      timestamp: string;
      records: DetailedAddressResult[];
    }> = [];

    if (results.length > 0) {
      list.push({
        id: "active",
        label: `Active Workspace Batch (${results.length} records)`,
        timestamp: results[0]?.analysedAt || "",
        records: results,
      });
    }

    for (const batch of batchHistory) {
      if (batch.id === "active") continue;
      if (Array.isArray(batch.results) && batch.results.length > 0) {
        list.push({
          id: batch.id,
          label: `${batch.title} (${batch.addressesCount} records)`,
          timestamp: batch.timestamp,
          records: batch.results,
        });
      }
    }

    return list;
  }, [results, batchHistory]);

  // Combine scoped records
  const scopedRecords = useMemo(() => {
    if (selectedRunScope === "all") {
      // If we have batchHistory with results, use them all; otherwise use active results
      if (batchHistory.length > 0) {
        const combined = batchHistory.flatMap((b) => b.results || []);
        if (combined.length > 0) return combined;
      }
      return results;
    }

    if (selectedRunScope === "active") {
      return results;
    }

    const found = availableRuns.find((r) => r.id === selectedRunScope);
    return found?.records || [];
  }, [selectedRunScope, batchHistory, results, availableRuns]);

  // Compute available providers for filter dropdown
  const allProvidersInScope = useMemo(() => {
    const stats = calculateProviderDistribution(scopedRecords);
    return stats.map((s) => s.provider);
  }, [scopedRecords]);

  // Apply secondary filters (verdict, provider)
  const filteredRecords = useMemo(() => {
    return scopedRecords.filter((r) => {
      if (selectedVerdictFilter !== "all" && r.verdict !== selectedVerdictFilter) {
        return false;
      }
      if (selectedProviderFilter !== "all") {
        const provider = calculateProviderDistribution([r])[0]?.provider || "Custom / Unknown Provider";
        if (provider !== selectedProviderFilter) {
          return false;
        }
      }
      return true;
    });
  }, [scopedRecords, selectedVerdictFilter, selectedProviderFilter]);

  // Telemetry metric calculations
  const totalAnalyzed = filteredRecords.length;
  const delivered = filteredRecords.filter((r) => r.verdict === "likely_delivered").length;
  const bounce = filteredRecords.filter((r) => r.verdict === "likely_bounce").length;
  const unknown = filteredRecords.filter((r) => r.verdict === "unknown").length;

  const deliveredPct = totalAnalyzed > 0 ? Number(((delivered / totalAnalyzed) * 100).toFixed(1)) : 0;
  const bouncePct = totalAnalyzed > 0 ? Number(((bounce / totalAnalyzed) * 100).toFixed(1)) : 0;
  const unknownPct = totalAnalyzed > 0 ? Number(((unknown / totalAnalyzed) * 100).toFixed(1)) : 0;

  // Domain & Provider Distributions
  const domainStats = useMemo(() => calculateDomainDistribution(filteredRecords, 7), [filteredRecords]);
  const providerStats = useMemo(() => calculateProviderDistribution(filteredRecords), [filteredRecords]);

  // Routing & SMTP & Data Quality
  const routingStats = useMemo(() => calculateDnsRoutingStats(filteredRecords), [filteredRecords]);
  const smtpStats = useMemo(() => calculateSmtpCoverageStats(filteredRecords), [filteredRecords]);
  const qualityStats = useMemo(() => calculateDataQualityStats(filteredRecords), [filteredRecords]);

  // Genuine chronological activity timeline (only genuine timestamps, strictly non-fabricated)
  const activityTimeline = useMemo(() => {
    const points: Array<{
      id: string;
      title: string;
      timestamp: string;
      count: number;
      delivered: number;
      bounce: number;
      unknown: number;
    }> = [];

    // If batchHistory has runs, use their genuine timestamps
    if (batchHistory.length > 0) {
      for (const batch of batchHistory) {
        points.push({
          id: batch.id,
          title: batch.title,
          timestamp: batch.timestamp,
          count: batch.addressesCount,
          delivered: batch.deliveredCount,
          bounce: batch.bounceCount,
          unknown: batch.unknownCount,
        });
      }
    } else if (results.length > 0) {
      points.push({
        id: "active",
        title: "Active Batch",
        timestamp: results[0]?.analysedAt || "",
        count: results.length,
        delivered: results.filter((r) => r.verdict === "likely_delivered").length,
        bounce: results.filter((r) => r.verdict === "likely_bounce").length,
        unknown: results.filter((r) => r.verdict === "unknown").length,
      });
    }

    // Sort chronologically ascending
    return points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [batchHistory, results]);

  // Determine time-range statement
  const timeRangeStatement = useMemo(() => {
    if (scopedRecords.length === 0) return "No data available";
    const dates = scopedRecords
      .map((r) => r.analysedAt)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !isNaN(t));

    if (dates.length === 0) return "Current session";
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    if (minDate.toDateString() === maxDate.toDateString()) {
      return `${minDate.toLocaleDateString()} (${minDate.toLocaleTimeString()} – ${maxDate.toLocaleTimeString()})`;
    }
    return `${minDate.toLocaleDateString()} – ${maxDate.toLocaleDateString()}`;
  }, [scopedRecords]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Technical Composition Telemetry
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Deliverability & Dataset Analytics
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            Aggregate ratios, mail provider routing, domain distributions, and verification step telemetry computed strictly from verified address datasets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button to="/app/analyze" size="sm">
            <MailCheck className="h-4 w-4 mr-1.5" />
            <span>Analyze New Batch</span>
          </Button>
        </div>
      </div>

      {scopedRecords.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            No Telemetry Available Yet
          </h2>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Analytics are generated from real verification batches. Analyze a list of email addresses in the workspace to calculate deliverability ratios, provider compositions, and pipeline outcomes.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <MailCheck className="h-4 w-4 mr-2" />
              <span>Go to Analyze Emails</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 2. Scope & Filter Controls Bar */}
          <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Dataset Filters
                </span>
              </div>

              {/* Reset Filters */}
              {(selectedVerdictFilter !== "all" || selectedProviderFilter !== "all" || selectedRunScope !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRunScope("all");
                    setSelectedVerdictFilter("all");
                    setSelectedProviderFilter("all");
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 underline cursor-pointer"
                >
                  Reset All Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Run Scope Selector */}
              <div>
                <label htmlFor="scope-select" className="block text-[11px] font-medium text-text-muted mb-1">
                  Analysis Run Scope
                </label>
                <select
                  id="scope-select"
                  value={selectedRunScope}
                  onChange={(e) => setSelectedRunScope(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                >
                  <option value="all">All Retained Batches ({availableRuns.length} runs)</option>
                  {availableRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Verdict Filter */}
              <div>
                <label htmlFor="verdict-select" className="block text-[11px] font-medium text-text-muted mb-1">
                  Verdict Classification
                </label>
                <select
                  id="verdict-select"
                  value={selectedVerdictFilter}
                  onChange={(e) => setSelectedVerdictFilter(e.target.value as Verdict | "all")}
                  className="w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                >
                  <option value="all">All Verdicts</option>
                  <option value="likely_delivered">Likely Delivered Only</option>
                  <option value="likely_bounce">Likely Bounce Only</option>
                  <option value="unknown">Unknown / Inconclusive Only</option>
                </select>
              </div>

              {/* Provider Filter */}
              <div>
                <label htmlFor="provider-select" className="block text-[11px] font-medium text-text-muted mb-1">
                  Inferred Mail Provider
                </label>
                <select
                  id="provider-select"
                  value={selectedProviderFilter}
                  onChange={(e) => setSelectedProviderFilter(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                >
                  <option value="all">All Mail Providers</option>
                  {allProvidersInScope.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scope & Data Provenance Banner */}
            <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-brand-400" />
                <span>
                  <strong>Time Range:</strong> {timeRangeStatement}
                </span>
                <span>•</span>
                <span>
                  <strong>Source:</strong>{" "}
                  {selectedRunScope === "all"
                    ? `Combined session history (${availableRuns.length} completed ${availableRuns.length === 1 ? "run" : "runs"})`
                    : "Selected batch run"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Dataset composition only (no demographic profiling)</span>
              </div>
            </div>
          </div>

          {/* 3. Primary KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Analyzed */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Total Addresses</span>
                <Layers className="h-4 w-4 text-text-muted" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-text-primary">{totalAnalyzed}</span>
                <span className="text-xs font-mono text-text-muted">
                  {qualityStats.uniqueAddressesCount} unique
                </span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Duplicate rate: {qualityStats.duplicateRate}% ({qualityStats.duplicateCount} repeated)
              </p>
            </div>

            {/* Likely Delivered */}
            <div className="rounded-xl border border-delivered/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Viable Delivery Ratio</span>
                <TrendingUp className="h-4 w-4 text-delivered" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-delivered">{deliveredPct}%</span>
                <span className="text-xs font-mono text-text-muted">{delivered} passed</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Addresses with confirmed active routing & pass signals
              </p>
            </div>

            {/* Likely Bounce */}
            <div className="rounded-xl border border-bounce/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Bounce Probability</span>
                <XCircle className="h-4 w-4 text-bounce" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-bounce">{bouncePct}%</span>
                <span className="text-xs font-mono text-text-muted">{bounce} rejected</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                NXDOMAIN, null MX (RFC 7505), or fatal 5xx rejections
              </p>
            </div>

            {/* Unknown / Inconclusive */}
            <div className="rounded-xl border border-unknown/30 bg-surface-secondary p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Inconclusive Rate</span>
                <HelpCircle className="h-4 w-4 text-unknown" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-bold font-mono text-unknown">{unknownPct}%</span>
                <span className="text-xs font-mono text-text-muted">{unknown} undetermined</span>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Never treated as bounce; greylisting, timeouts, or unprobed
              </p>
            </div>
          </div>

          {/* 4. Verdict Distribution Chart */}
          <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Verdict Distribution Across Dataset
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Proportionate classification breakdown across all {totalAnalyzed} filtered records.
                </p>
              </div>
              <span className="text-xs font-mono text-text-muted">
                100% Normalized Telemetry
              </span>
            </div>

            {/* Accessible Stacked Bar Chart */}
            <div
              className="flex h-5 w-full overflow-hidden rounded-full bg-surface-elevated"
              role="img"
              aria-label={`Verdict Distribution: ${deliveredPct}% Delivered, ${bouncePct}% Bounce, ${unknownPct}% Unknown`}
            >
              {deliveredPct > 0 && (
                <div
                  style={{ width: `${deliveredPct}%` }}
                  className="bg-delivered transition-all duration-500 hover:brightness-110"
                  title={`Likely Delivered: ${delivered} (${deliveredPct}%)`}
                />
              )}
              {bouncePct > 0 && (
                <div
                  style={{ width: `${bouncePct}%` }}
                  className="bg-bounce transition-all duration-500 hover:brightness-110"
                  title={`Likely Bounce: ${bounce} (${bouncePct}%)`}
                />
              )}
              {unknownPct > 0 && (
                <div
                  style={{ width: `${unknownPct}%` }}
                  className="bg-unknown transition-all duration-500 hover:brightness-110"
                  title={`Unknown: ${unknown} (${unknownPct}%)`}
                />
              )}
            </div>

            {/* Segment Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-delivered shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Likely Delivered</p>
                    <p className="text-base font-bold font-mono text-delivered">{delivered} <span className="text-xs font-normal text-text-muted">({deliveredPct}%)</span></p>
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-delivered/60" />
              </div>

              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-bounce shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Likely Bounce</p>
                    <p className="text-base font-bold font-mono text-bounce">{bounce} <span className="text-xs font-normal text-text-muted">({bouncePct}%)</span></p>
                  </div>
                </div>
                <XCircle className="h-4 w-4 text-bounce/60" />
              </div>

              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-unknown shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Unknown / Inconclusive</p>
                    <p className="text-base font-bold font-mono text-unknown">{unknown} <span className="text-xs font-normal text-text-muted">({unknownPct}%)</span></p>
                  </div>
                </div>
                <HelpCircle className="h-4 w-4 text-unknown/60" />
              </div>
            </div>
          </div>

          {/* 5. Domain Distribution & Provider Distribution Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Domain Distribution */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Top Domain Distribution
                  </h2>
                </div>
                <span className="text-xs font-mono text-text-muted">
                  {domainStats.length} domains shown
                </span>
              </div>

              <div className="space-y-3">
                {domainStats.map((item: DomainStat) => (
                  <div key={item.domain} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-text-primary font-medium truncate max-w-[200px]" title={item.domain}>
                        {item.domain}
                      </span>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-text-muted">{item.count} addrs ({item.percentage}%)</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-delivered">{item.delivered}✓</span>
                          <span className="text-bounce">{item.bounce}✗</span>
                          <span className="text-unknown">{item.unknown}?</span>
                        </div>
                      </div>
                    </div>
                    {/* Visual bar */}
                    <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden flex">
                      <div style={{ width: `${item.percentage}%` }} className="bg-brand-400 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email Provider Distribution */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Inferred Email Provider Infrastructure
                  </h2>
                </div>
                <span className="text-xs text-text-muted">Routing breakdown</span>
              </div>

              <div className="space-y-3">
                {providerStats.map((item: ProviderStat) => (
                  <div key={item.provider} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-primary font-medium truncate max-w-[220px]" title={item.provider}>
                        {item.provider}
                      </span>
                      <span className="font-mono text-[11px] text-text-muted">
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden flex">
                      <div style={{ width: `${item.percentage}%` }} className="bg-indigo-400 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-text-muted pt-2 border-t border-border-subtle leading-relaxed">
                <Info className="h-3 w-3 inline mr-1 text-text-muted/80" />
                Provider inference reflects mail infrastructure routing and does not imply mailbox deliverability or personal demographics.
              </p>
            </div>
          </div>

          {/* 6. Routing Outcomes & SMTP Check Coverage Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* DNS & Mail-Routing Outcomes */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    DNS & Mail-Routing Outcomes
                  </h2>
                </div>
                <span className="text-xs text-text-muted">Protocol resolution</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                  <span className="text-[11px] text-text-muted block">Active MX Target</span>
                  <span className="text-xl font-bold font-mono text-emerald-400 mt-0.5 block">
                    {routingStats.hasMx}
                  </span>
                  <span className="text-[10px] text-text-muted">Standard mail server route</span>
                </div>

                <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                  <span className="text-[11px] text-text-muted block">NXDOMAIN (No Domain)</span>
                  <span className="text-xl font-bold font-mono text-rose-400 mt-0.5 block">
                    {routingStats.nxdomain}
                  </span>
                  <span className="text-[10px] text-text-muted">Non-existent authoritative domain</span>
                </div>

                <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                  <span className="text-[11px] text-text-muted block">Null MX (RFC 7505)</span>
                  <span className="text-xl font-bold font-mono text-amber-400 mt-0.5 block">
                    {routingStats.nullMx}
                  </span>
                  <span className="text-[10px] text-text-muted">Explicitly refuses mail</span>
                </div>

                <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                  <span className="text-[11px] text-text-muted block">Implicit MX (RFC 5321 §5.1)</span>
                  <span className="text-xl font-bold font-mono text-text-primary mt-0.5 block">
                    {routingStats.implicitMx}
                  </span>
                  <span className="text-[10px] text-text-muted">Fallback to host A/AAAA record</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs text-text-muted">
                <span>DNS Inconclusive / Timeout Queries:</span>
                <span className="font-mono font-medium text-text-primary">{routingStats.inconclusive}</span>
              </div>
            </div>

            {/* SMTP Check Coverage & Outcomes */}
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    SMTP Handshake Coverage
                  </h2>
                </div>
                <span className="text-xs text-text-muted">Opt-in probe signals</span>
              </div>

              <div className="space-y-3 pt-1">
                {/* Probed vs Disabled/Unavailable */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Probed Recipient Envelope:</span>
                  <span className="font-mono text-text-primary font-semibold">
                    {smtpStats.probed} addresses
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Probe Disabled / Skipped:</span>
                  <span className="font-mono text-text-muted">
                    {smtpStats.skippedOrDisabled} addresses
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Port 25 Unavailable / Cloud Blocked:</span>
                  <span className="font-mono text-amber-400">
                    {smtpStats.unavailableOrBlocked} addresses
                  </span>
                </div>

                {/* Sub-breakdown of probed */}
                {smtpStats.probed > 0 && (
                  <div className="pt-2 border-t border-border-subtle grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-surface-primary border border-border-subtle">
                      <span className="text-[10px] text-text-muted block">Accepted (250)</span>
                      <span className="font-bold font-mono text-delivered">{smtpStats.accepted}</span>
                    </div>
                    <div className="p-2 rounded bg-surface-primary border border-border-subtle">
                      <span className="text-[10px] text-text-muted block">Rejected (5xx)</span>
                      <span className="font-bold font-mono text-bounce">{smtpStats.rejected}</span>
                    </div>
                    <div className="p-2 rounded bg-surface-primary border border-border-subtle">
                      <span className="text-[10px] text-text-muted block">Greylisted (4xx)</span>
                      <span className="font-bold font-mono text-unknown">{smtpStats.inconclusiveOrGreylisted}</span>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-text-muted pt-1 leading-relaxed">
                  Note: Port 25 egress blocks and timeouts are strictly classified as inconclusive or unavailable, never falsified as bounces.
                </p>
              </div>
            </div>
          </div>

          {/* 7. Analysis Activity Over Time (Genuine chronological timeline) */}
          {activityTimeline.length > 0 && (
            <div className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Analysis Activity & Telemetry Over Time
                  </h2>
                </div>
                <span className="text-xs font-mono text-text-muted">
                  {activityTimeline.length} verified {activityTimeline.length === 1 ? "execution" : "executions"} in session
                </span>
              </div>

              {/* Activity Timeline List */}
              <div className="divide-y divide-border-subtle">
                {activityTimeline.map((item, idx) => {
                  const itemDeliveredPct = item.count > 0 ? Math.round((item.delivered / item.count) * 100) : 0;
                  return (
                    <div key={item.id || idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-text-muted text-[11px]">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-medium text-text-primary">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-text-muted">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono font-medium text-text-primary">
                          {item.count} addresses
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="text-delivered">{item.delivered} delivered ({itemDeliveredPct}%)</span>
                          <span>•</span>
                          <span className="text-bounce">{item.bounce} bounce</span>
                          <span>•</span>
                          <span className="text-unknown">{item.unknown} unknown</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-border-subtle flex items-center gap-2 text-[11px] text-text-muted">
                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                <span>
                  <strong>Genuine Telemetry Notice:</strong> Timeline points reflect verified batches in session memory. Historical time-series data is never synthesized or populated with dummy trend lines.
                </span>
              </div>
            </div>
          )}

          {/* 8. Data Quality & Hygiene Indicators */}
          <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                <ShieldCheck className="h-4 w-4 text-brand-400" />
                <span>Dataset Quality & Syntax Hygiene Indicators</span>
              </div>
              <span className="text-xs text-text-muted font-mono">
                {qualityStats.syntaxPassRate}% syntax pass rate
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                <span className="text-[11px] text-text-muted block">RFC Syntax Valid</span>
                <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">
                  {qualityStats.syntaxValidCount}
                </span>
                <span className="text-[10px] text-text-muted">{qualityStats.syntaxPassRate}% conformance</span>
              </div>

              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                <span className="text-[11px] text-text-muted block">Syntax Violations</span>
                <span className="text-lg font-bold font-mono text-rose-400 mt-1 block">
                  {qualityStats.syntaxInvalidCount}
                </span>
                <span className="text-[10px] text-text-muted">Failed RFC 5321/5322 grammar</span>
              </div>

              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                <span className="text-[11px] text-text-muted block">Unique Address Density</span>
                <span className="text-lg font-bold font-mono text-text-primary mt-1 block">
                  {qualityStats.uniqueAddressesCount}
                </span>
                <span className="text-[10px] text-text-muted">{qualityStats.duplicateCount} repeated occurrences</span>
              </div>

              <div className="p-3 rounded-lg border border-border-subtle bg-surface-primary">
                <span className="text-[11px] text-text-muted block">Test Fixtures</span>
                <span className="text-lg font-bold font-mono text-brand-400 mt-1 block">
                  {qualityStats.fixtureCount}
                </span>
                <span className="text-[10px] text-text-muted">{qualityStats.fixtureRate}% RFC 2606 demo fixtures</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
