import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  History,
  Download,
  Trash2,
  MailCheck,
  Clock,
  ArrowRight,
  ShieldCheck,
  Search,
  Calendar,
  AlertCircle,
  RefreshCw,
  Info,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { useAnalysis, type AnalysisBatchRecord } from "../context/AnalysisContext";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { downloadResultsCsv } from "../utils/csvExport";

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const {
    batchHistory,
    deleteBatchFromHistory,
    clearHistory,
    setResults,
    logExport,
    refreshHistory,
    isSyncingHistory,
    historyError,
  } = useAnalysis();

  const navigate = useNavigate();

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Deletion modal state
  const [batchToDelete, setBatchToDelete] = useState<AnalysisBatchRecord | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Details expired modal state
  const [expiredRunExplanation, setExpiredRunExplanation] = useState<AnalysisBatchRecord | null>(null);

  // Filter runs
  const filteredRuns = useMemo(() => {
    return batchHistory.filter((batch) => {
      // 1. Search Query (checks batch ID, title, and domain summary)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = batch.id.toLowerCase().includes(q);
        const matchesTitle = batch.title.toLowerCase().includes(q);
        const matchesDomain = batch.domainsSummary?.some((d) =>
          d.domain.toLowerCase().includes(q)
        );
        if (!matchesId && !matchesTitle && !matchesDomain) return false;
      }

      // 2. Date Range Filters
      if (startDate) {
        const batchDate = new Date(batch.timestamp);
        const start = new Date(startDate);
        if (batchDate < start) return false;
      }
      if (endDate) {
        const batchDate = new Date(batch.timestamp);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (batchDate > end) return false;
      }

      // 3. Status filter
      if (statusFilter !== "all") {
        const batchStatus = batch.status || "completed";
        if (batchStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [batchHistory, searchQuery, startDate, endDate, statusFilter]);

  // Pagination calculation
  const totalItems = filteredRuns.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const paginatedRuns = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRuns.slice(start, start + PAGE_SIZE);
  }, [filteredRuns, currentPage]);

  const handleInspectBatch = (batch: AnalysisBatchRecord) => {
    if (batch.hasDetailedResults && batch.results && batch.results.length > 0) {
      setResults(batch.results);
      navigate("/app/analyze");
    } else {
      setExpiredRunExplanation(batch);
    }
  };

  const handleExportBatch = (batch: AnalysisBatchRecord) => {
    if (batch.hasDetailedResults && batch.results && batch.results.length > 0) {
      const filename = downloadResultsCsv(batch.results);
      logExport(filename, batch.results.length, "all");
    } else {
      setExpiredRunExplanation(batch);
    }
  };

  const confirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    try {
      await deleteBatchFromHistory(batchToDelete.id);
    } finally {
      setIsDeleting(false);
      setBatchToDelete(null);
    }
  };

  const confirmClearAll = async () => {
    setIsDeleting(true);
    try {
      await clearHistory();
    } finally {
      setIsDeleting(false);
      setShowClearConfirm(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchQuery || startDate || endDate || statusFilter !== "all");

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Execution Ledger
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Analysis History
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            Audit and manage completed verification runs across your workspace. Re-load retained batches into the analyzer, export CSV reports, or audit domain telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refreshHistory()}
            disabled={isSyncingHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer disabled:opacity-50"
            title="Synchronize history with server database"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncingHistory ? "animate-spin text-brand-400" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {batchHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer"
              title="Clear all retained batch history records"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear History</span>
            </button>
          )}

          <Button to="/app/analyze" size="sm">
            <MailCheck className="h-4 w-4 mr-1.5" />
            <span>New Batch</span>
          </Button>
        </div>
      </div>

      {/* Sync Warning / Error Alert */}
      {historyError && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Backend history synchronization offline. Displaying local client ledger records.</span>
          </div>
          <button
            type="button"
            onClick={() => refreshHistory()}
            className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300 ml-4 cursor-pointer"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* 2. Filters & Search Bar */}
      {batchHistory.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-secondary/70 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search run ID or domain..."
                className="w-full rounded-lg border border-border-subtle bg-surface-primary pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* Start Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter runs starting from this date"
                className="w-full rounded-lg border border-border-subtle bg-surface-primary pl-9 pr-3 py-1.5 text-xs text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* End Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter runs up to this date"
                className="w-full rounded-lg border border-border-subtle bg-surface-primary pl-9 pr-3 py-1.5 text-xs text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-border-subtle hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                  title="Reset all filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Content: Empty State or Table */}
      {batchHistory.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <History className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            No Analysis Runs Recorded
          </h3>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Every email batch analyzed in Mailora is logged here. Run metadata is retained with privacy protection, allowing you to re-inspect results, export CSV records, or view deliverability analytics.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <MailCheck className="h-4 w-4 mr-2" />
              <span>Start Analyzing Addresses</span>
            </Button>
          </div>
        </div>
      ) : filteredRuns.length === 0 ? (
        /* No Search Matches */
        <div className="rounded-xl border border-border-subtle bg-surface-secondary p-8 text-center">
          <Search className="h-8 w-8 mx-auto text-text-muted mb-2" />
          <h4 className="text-sm font-semibold text-text-primary">No Matching Analysis Runs</h4>
          <p className="text-xs text-text-secondary mt-1">
            No history entries match your current search query or date range filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 text-xs text-brand-400 hover:text-brand-300 underline font-medium cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Batches Table */}
          <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-elevated/60 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    <th scope="col" className="px-5 py-3.5">
                      Run Identifier & Metadata
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Timestamp
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Addresses
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Verdict Distribution
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs text-text-secondary">
                  {paginatedRuns.map((batch) => {
                    const hasDetails = Boolean(batch.hasDetailedResults && batch.results && batch.results.length > 0);
                    return (
                      <tr
                        key={batch.id}
                        className="hover:bg-surface-elevated/40 transition-colors"
                      >
                        {/* Run ID & Metadata */}
                        <td className="px-5 py-4 font-medium text-text-primary">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary">{batch.title}</span>
                            {batch.smtpProbed && (
                              <span
                                className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-400 border border-brand-500/20"
                                title="SMTP recipient handshake was performed on this batch"
                              >
                                SMTP
                              </span>
                            )}
                            {!hasDetails && (
                              <span
                                className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] text-text-muted border border-border-subtle"
                                title="Detailed address records have expired under data retention policy; summary metrics preserved"
                              >
                                Metadata Only
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-mono text-text-muted select-all">
                              {batch.id}
                            </span>
                          </div>

                          {/* Top Domains Summary (privacy conscious - no raw addresses) */}
                          {batch.domainsSummary && batch.domainsSummary.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {batch.domainsSummary.slice(0, 3).map((d) => (
                                <span
                                  key={d.domain}
                                  className="text-[10px] font-mono bg-surface-elevated text-text-muted px-1.5 py-0.2 rounded border border-border-subtle"
                                >
                                  {d.domain} ({d.count})
                                </span>
                              ))}
                              {batch.domainsSummary.length > 3 && (
                                <span className="text-[10px] text-text-muted px-1">
                                  +{batch.domainsSummary.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-4 whitespace-nowrap text-text-muted">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Clock className="h-3.5 w-3.5 text-text-muted/60" />
                            <span>
                              {new Date(batch.timestamp).toLocaleDateString()}{" "}
                              {new Date(batch.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {batch.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Completed</span>
                            </span>
                          )}
                        </td>

                        {/* Total Addresses */}
                        <td className="px-4 py-4 whitespace-nowrap font-mono font-medium text-text-primary">
                          {batch.addressesCount}
                        </td>

                        {/* Verdict Distribution */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span title="Likely Delivered count">
                              <Badge color="delivered">{batch.deliveredCount}</Badge>
                            </span>
                            <span title="Likely Bounce count">
                              <Badge color="bounce">{batch.bounceCount}</Badge>
                            </span>
                            <span title="Unknown / Inconclusive count">
                              <Badge color="unknown">{batch.unknownCount}</Badge>
                            </span>
                          </div>
                        </td>


                        {/* Actions */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* CSV Export Action */}
                            <button
                              type="button"
                              onClick={() => handleExportBatch(batch)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border-subtle bg-surface-primary text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                              title={
                                hasDetails
                                  ? "Export this run's results as sanitized CSV"
                                  : "Detailed results have expired; export unavailable"
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">CSV</span>
                            </button>

                            {/* Inspect Action */}
                            <button
                              type="button"
                              onClick={() => handleInspectBatch(batch)}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer shadow-sm ${
                                hasDetails
                                  ? "bg-brand-500 text-white hover:bg-brand-600"
                                  : "border border-border-subtle bg-surface-elevated text-text-secondary hover:text-text-primary"
                              }`}
                              title={
                                hasDetails
                                  ? "Load batch into Analyzer workspace"
                                  : "Inspect run details and explanation"
                              }
                            >
                              <span>Inspect</span>
                              {hasDetails ? (
                                <ArrowRight className="h-3.5 w-3.5" />
                              ) : (
                                <Info className="h-3.5 w-3.5 text-text-muted" />
                              )}
                            </button>

                            {/* Delete Action */}
                            <button
                              type="button"
                              onClick={() => setBatchToDelete(batch)}
                              className="p-1.5 rounded-md text-text-muted hover:text-rose-500 hover:bg-surface-elevated transition-colors cursor-pointer"
                              title="Delete this run from history"
                              aria-label={`Delete run ${batch.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface-elevated/30 text-xs text-text-secondary">
                <span>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} runs
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded border border-border-subtle disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="px-2 font-mono text-text-muted">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 rounded border border-border-subtle disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Privacy & Data Retention Guarantee Statement */}
      <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-primary">
          <ShieldCheck className="h-4 w-4 text-brand-400" />
          <span>Mailora Privacy & Data Retention Policy</span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          To protect confidentiality and adhere to strict data-minimization practices, Mailora never stores uploaded source documents or raw recipient address lists in the server database. Completed verification runs retain aggregate metadata (verdict counts, domain breakdown, and timestamps) for up to 30 days before automatic pruning. Full detailed address verification records are stored exclusively in your local browser session storage and remain isolated to your device.
        </p>
      </div>

      {/* 5. Confirmation Modal: Delete Single Run */}
      {batchToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-run-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-primary p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-rose-500">
                <AlertCircle className="h-5 w-5" />
                <h3 id="delete-run-title" className="text-base font-bold text-text-primary">
                  Delete Analysis Run?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to delete analysis run{" "}
              <span className="font-mono font-semibold text-text-primary">{batchToDelete.id}</span>?
              This will permanently remove the run and its associated deliverability telemetry from your history ledger.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                className="px-3.5 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteBatch}
                className="px-3.5 py-1.5 text-xs rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Confirmation Modal: Clear All History */}
      {showClearConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-primary p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-rose-500">
                <AlertCircle className="h-5 w-5" />
                <h3 id="clear-history-title" className="text-base font-bold text-text-primary">
                  Clear All History Records?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              This action will permanently delete all {batchHistory.length} recorded analysis runs from both your local browser storage and the backend history ledger. This operation cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmClearAll}
                className="px-3.5 py-1.5 text-xs rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Clearing..." : "Yes, Clear All History"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Explanation Modal: Detailed Results Expired */}
      {expiredRunExplanation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expired-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-xl border border-border-default bg-surface-primary p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-brand-400">
                <Info className="h-5 w-5" />
                <h3 id="expired-details-title" className="text-base font-bold text-text-primary">
                  Detailed Results Expired or Not Retained
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExpiredRunExplanation(null)}
                className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed">
              <p>
                Run <span className="font-mono font-semibold text-text-primary">{expiredRunExplanation.id}</span> was executed on{" "}
                <span className="font-mono text-text-primary">
                  {new Date(expiredRunExplanation.timestamp).toLocaleString()}
                </span>
                .
              </p>

              <div className="rounded-lg border border-border-subtle bg-surface-secondary/70 p-3 space-y-1.5">
                <div className="font-semibold text-text-primary text-[11px] uppercase tracking-wider">
                  Preserved Aggregate Metrics:
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Total Addresses: <span className="font-semibold text-text-primary">{expiredRunExplanation.addressesCount}</span></div>
                  <div>Likely Delivered: <span className="font-semibold text-emerald-500">{expiredRunExplanation.deliveredCount}</span></div>
                  <div>Likely Bounce: <span className="font-semibold text-rose-500">{expiredRunExplanation.bounceCount}</span></div>
                  <div>Unknown: <span className="font-semibold text-amber-500">{expiredRunExplanation.unknownCount}</span></div>
                </div>
              </div>

              <p>
                In accordance with Mailora&apos;s data privacy policy, individual recipient email addresses and per-mailbox check payloads are not persisted indefinitely on the server. Because this run was executed in a prior session or device, its individual address rows have expired.
              </p>

              <p>
                You can still view the dataset composition and technical demographics in the Analytics workspace.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                to="/app/analytics"
                size="sm"
                variant="secondary"
                onClick={() => setExpiredRunExplanation(null)}
              >
                <span>View Analytics</span>
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>

              <button
                type="button"
                onClick={() => setExpiredRunExplanation(null)}
                className="px-3.5 py-1.5 text-xs rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
