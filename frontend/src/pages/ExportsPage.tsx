import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  Layers,
  Check,
  AlertCircle,
  Trash2,
  Table,
  SlidersHorizontal,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import Button from "../components/Button";
import {
  downloadResultsCsv,
  CSV_COLUMN_OPTIONS,
  type CsvColumnOption,
} from "../utils/csvExport";
import type { DetailedAddressResult, Verdict } from "../types";

export default function ExportsPage() {
  const { results, batchHistory, clearHistory, exportHistory, logExport } = useAnalysis();

  // Run selection state
  // "active" refers to current workspace results, or a specific batch id from batchHistory
  const [selectedRunId, setSelectedRunId] = useState<string>("active");

  // Filter state for report subset
  const [filterSubset, setFilterSubset] = useState<Verdict | "all">("all");

  // Selected column IDs state (default to recommended columns)
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(
    CSV_COLUMN_OPTIONS.filter((c) => c.defaultSelected).map((c) => c.id)
  );

  // Download feedback states
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
    filename?: string;
  } | null>(null);

  // Available completed runs
  const availableRuns = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      timestamp: string;
      count: number;
      records: DetailedAddressResult[];
      isAvailable: boolean;
    }> = [];

    // Active workspace results
    if (results.length > 0) {
      list.push({
        id: "active",
        label: `Active Workspace Batch (${results.length} addresses)`,
        timestamp: results[0]?.analysedAt || "",
        count: results.length,
        records: results,
        isAvailable: true,
      });
    }

    // Historical runs from session storage
    for (const batch of batchHistory) {
      // Avoid duplicate if active batch already matches batchHistory[0] id
      if (batch.id === "active") continue;
      const hasRecords = Array.isArray(batch.results) && batch.results.length > 0;
      list.push({
        id: batch.id,
        label: `${batch.title} - ${new Date(batch.timestamp).toLocaleTimeString()}`,
        timestamp: batch.timestamp,
        count: batch.addressesCount,
        records: hasRecords ? batch.results : [],
        isAvailable: hasRecords,
      });
    }

    return list;
  }, [results, batchHistory]);

  // Determine active run
  const activeRun = useMemo(() => {
    if (availableRuns.length === 0) return null;
    const found = availableRuns.find((r) => r.id === selectedRunId);
    return found || availableRuns[0];
  }, [availableRuns, selectedRunId]);

  // Filter records based on subset
  const activeRecords = useMemo(() => activeRun?.records || [], [activeRun]);
  const filteredRecords = useMemo(() => {
    if (filterSubset === "all") return activeRecords;
    return activeRecords.filter((r) => r.verdict === filterSubset);
  }, [activeRecords, filterSubset]);

  // Counts & verdict breakdown
  const deliveredCount = activeRecords.filter((r) => r.verdict === "likely_delivered").length;
  const bounceCount = activeRecords.filter((r) => r.verdict === "likely_bounce").length;
  const unknownCount = activeRecords.filter((r) => r.verdict === "unknown").length;
  const totalCount = activeRecords.length;

  const deliveredPct = totalCount > 0 ? ((deliveredCount / totalCount) * 100).toFixed(1) : "0";
  const bouncePct = totalCount > 0 ? ((bounceCount / totalCount) * 100).toFixed(1) : "0";
  const unknownPct = totalCount > 0 ? ((unknownCount / totalCount) * 100).toFixed(1) : "0";

  // Column selection helpers
  const toggleColumn = (id: string) => {
    setFeedback(null);
    setSelectedColumnIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one column
        return prev.filter((colId) => colId !== id);
      }
      return [...prev, id];
    });
  };

  const handleSelectPreset = (preset: "standard" | "all" | "minimal") => {
    setFeedback(null);
    if (preset === "standard") {
      setSelectedColumnIds(
        CSV_COLUMN_OPTIONS.filter((c) => c.defaultSelected).map((c) => c.id)
      );
    } else if (preset === "all") {
      setSelectedColumnIds(CSV_COLUMN_OPTIONS.map((c) => c.id));
    } else if (preset === "minimal") {
      setSelectedColumnIds(["address", "verdict", "reason_code"]);
    }
  };

  // Preview columns & rows (First 4 rows max)
  const activeColumns = useMemo(() => {
    return CSV_COLUMN_OPTIONS.filter((c) => selectedColumnIds.includes(c.id));
  }, [selectedColumnIds]);

  const previewRows = useMemo(() => {
    return filteredRecords.slice(0, 4);
  }, [filteredRecords]);

  // Generate & Download CSV
  const handleDownloadCsv = () => {
    setFeedback(null);
    if (!activeRun || !activeRun.isAvailable || filteredRecords.length === 0) {
      setFeedback({
        type: "error",
        message: "No valid analysis records are available to generate this report.",
      });
      return;
    }

    try {
      const prefix =
        filterSubset === "all"
          ? "mailora_report"
          : `mailora_${filterSubset}`;
      const filename = downloadResultsCsv(filteredRecords, prefix, selectedColumnIds);
      logExport(filename, filteredRecords.length, filterSubset);
      setFeedback({
        type: "success",
        message: `Successfully generated and downloaded ${filename} with ${filteredRecords.length} records.`,
        filename,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: "error",
        message: `CSV generation failed: ${msg}`,
      });
    }
  };

  // Purge ephemeral session data
  const handlePurgeHistory = () => {
    clearHistory();
    setFeedback({
      type: "success",
      message: "Session analysis history and temporary report records have been securely cleared from browser memory.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Data Management & Reports
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Export Center
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            Configure, preview, and download sanitized RFC 4180 CSV reports from completed analysis runs with built-in defense against spreadsheet formula injection (CWE-1236).
          </p>
        </div>

        {activeRun && activeRun.isAvailable && filteredRecords.length > 0 && (
          <div className="flex items-center gap-3">
            <Button size="md" onClick={handleDownloadCsv}>
              <Download className="h-4 w-4 mr-2" />
              <span>Download CSV Report ({filteredRecords.length})</span>
            </Button>
          </div>
        )}
      </div>

      {/* Empty State when no results or runs exist */}
      {availableRuns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            No Completed Analysis Runs Available
          </h2>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Exports are generated from real verification batches. Analyze a list of addresses in the workspace to unlock report generation and CSV downloads.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <span>Go to Analyze Emails</span>
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-text-muted hover:text-text-primary text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 2. Run Selector & Metadata Card */}
          <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
            <div className="border-b border-border-subtle bg-surface-elevated/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Layers className="h-4 w-4 text-brand-400" />
                  <span>Select Analysis Run</span>
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Choose a completed run from your current session to inspect and export.
                </p>
              </div>

              {/* Run Selector Dropdown */}
              <div className="flex items-center gap-2">
                <label htmlFor="run-select" className="sr-only">
                  Select Completed Run
                </label>
                <select
                  id="run-select"
                  value={selectedRunId}
                  onChange={(e) => {
                    setSelectedRunId(e.target.value);
                    setFeedback(null);
                  }}
                  className="rounded-lg border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                >
                  {availableRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Run Unavailable Warning */}
            {activeRun && !activeRun.isAvailable ? (
              <div className="p-6 text-center text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 space-y-2">
                <AlertCircle className="h-6 w-6 mx-auto text-amber-500" />
                <p className="font-semibold text-sm">Report Data No Longer Available</p>
                <p className="max-w-md mx-auto text-text-secondary">
                  The detailed records for this run are no longer available in session memory. To export this dataset, please re-run verification from the{" "}
                  <Link to="/app/analyze" className="text-brand-400 underline">
                    Analyze Emails
                  </Link>{" "}
                  page rather than creating a fabricated download.
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Statistics & Verdict Distribution Bar */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Verdict Distribution ({totalCount} total addresses)
                    </span>
                    <span className="text-xs font-mono text-text-muted">
                      Executed: {activeRun ? new Date(activeRun.timestamp).toLocaleString() : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {/* All Records Subset */}
                    <button
                      type="button"
                      onClick={() => setFilterSubset("all")}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        filterSubset === "all"
                          ? "border-brand-500 bg-brand-500/10 text-brand-400 shadow-sm"
                          : "border-border-subtle bg-surface-primary text-text-secondary hover:border-border-default"
                      }`}
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                        All Records
                      </p>
                      <p className="text-xl font-bold font-mono text-text-primary mt-1">
                        {totalCount}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">100% of batch</p>
                    </button>

                    {/* Likely Delivered Subset */}
                    <button
                      type="button"
                      onClick={() => setFilterSubset("likely_delivered")}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        filterSubset === "likely_delivered"
                          ? "border-delivered bg-delivered/10 text-delivered shadow-sm"
                          : "border-border-subtle bg-surface-primary text-text-secondary hover:border-delivered/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-delivered">
                          Likely Delivered
                        </span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-delivered" />
                      </div>
                      <p className="text-xl font-bold font-mono text-delivered mt-1">
                        {deliveredCount}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">{deliveredPct}% of batch</p>
                    </button>

                    {/* Likely Bounce Subset */}
                    <button
                      type="button"
                      onClick={() => setFilterSubset("likely_bounce")}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        filterSubset === "likely_bounce"
                          ? "border-bounce bg-bounce/10 text-bounce shadow-sm"
                          : "border-border-subtle bg-surface-primary text-text-secondary hover:border-bounce/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-bounce">
                          Likely Bounce
                        </span>
                        <XCircle className="h-3.5 w-3.5 text-bounce" />
                      </div>
                      <p className="text-xl font-bold font-mono text-bounce mt-1">
                        {bounceCount}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">{bouncePct}% of batch</p>
                    </button>

                    {/* Unknown Subset */}
                    <button
                      type="button"
                      onClick={() => setFilterSubset("unknown")}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        filterSubset === "unknown"
                          ? "border-unknown bg-unknown/10 text-unknown shadow-sm"
                          : "border-border-subtle bg-surface-primary text-text-secondary hover:border-unknown/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-unknown">
                          Unknown
                        </span>
                        <HelpCircle className="h-3.5 w-3.5 text-unknown" />
                      </div>
                      <p className="text-xl font-bold font-mono text-unknown mt-1">
                        {unknownCount}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">{unknownPct}% of batch</p>
                    </button>
                  </div>
                </div>

                {/* 3. CSV Column Selection */}
                <div className="pt-4 border-t border-border-subtle">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-brand-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        CSV Column Selection ({selectedColumnIds.length} of {CSV_COLUMN_OPTIONS.length} active)
                      </h3>
                    </div>

                    {/* Column Presets */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-text-muted text-[11px] mr-1">Presets:</span>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset("standard")}
                        className="px-2 py-0.5 rounded border border-border-subtle bg-surface-primary text-text-secondary hover:text-text-primary hover:border-border-default text-[11px] cursor-pointer"
                      >
                        Recommended Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset("minimal")}
                        className="px-2 py-0.5 rounded border border-border-subtle bg-surface-primary text-text-secondary hover:text-text-primary hover:border-border-default text-[11px] cursor-pointer"
                      >
                        Minimal (CRM)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset("all")}
                        className="px-2 py-0.5 rounded border border-border-subtle bg-surface-primary text-text-secondary hover:text-text-primary hover:border-border-default text-[11px] cursor-pointer"
                      >
                        Full Audit
                      </button>
                    </div>
                  </div>

                  {/* Columns Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {CSV_COLUMN_OPTIONS.map((col: CsvColumnOption) => {
                      const isChecked = selectedColumnIds.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                            isChecked
                              ? "border-brand-500/40 bg-brand-500/5 text-text-primary"
                              : "border-border-subtle bg-surface-primary text-text-muted hover:border-border-default"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleColumn(col.id)}
                            className="h-3.5 w-3.5 mt-0.5 rounded border-border-default text-brand-500 focus:ring-brand-400 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <span className="font-medium block truncate">{col.label}</span>
                            <span className="text-[10px] text-text-muted block truncate" title={col.description}>
                              {col.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Report Sample Preview */}
                <div className="pt-4 border-t border-border-subtle space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <div className="flex items-center gap-1.5 font-medium text-text-secondary">
                      <Table className="h-3.5 w-3.5 text-brand-400" />
                      <span>Report Preview ({previewRows.length} of {filteredRecords.length} records shown)</span>
                    </div>
                    <span>Exporting {activeColumns.length} columns</span>
                  </div>

                  {previewRows.length === 0 ? (
                    <div className="p-6 text-center text-xs text-text-muted border border-border-subtle rounded-lg bg-surface-primary">
                      No records match the active filter subset ({filterSubset}).
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-primary">
                      <table className="min-w-full divide-y divide-border-subtle text-xs">
                        <thead className="bg-surface-elevated/60 text-text-secondary">
                          <tr>
                            {activeColumns.map((col) => (
                              <th
                                key={col.id}
                                scope="col"
                                className="px-3 py-2 text-left font-semibold font-mono text-[11px] whitespace-nowrap"
                              >
                                {col.header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle font-mono text-[11px]">
                          {previewRows.map((row, idx) => (
                            <tr key={row.id || idx} className="hover:bg-surface-elevated/40">
                              {activeColumns.map((col) => (
                                <td
                                  key={col.id}
                                  className="px-3 py-2 text-text-primary whitespace-nowrap max-w-xs truncate"
                                  title={String(col.getValue(row))}
                                >
                                  {String(col.getValue(row))}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5. Primary Action Download Bar */}
                <div className="pt-4 border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      UTF-8 Unicode with BOM encoding enabled. Verified Excel and Sheets compatibility.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    disabled={filteredRecords.length === 0}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                    <span>Generate & Download CSV ({filteredRecords.length} records)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Session Export History */}
      <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4 bg-surface-elevated/40 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Session Export History
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Reports generated and downloaded during your active browser tab session.
            </p>
          </div>
          {exportHistory.length > 0 && (
            <span className="text-xs font-mono text-text-muted">
              {exportHistory.length} files logged
            </span>
          )}
        </div>

        {exportHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-text-muted">
            No files downloaded yet in this session. Click "Generate & Download CSV" above to export.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {exportHistory.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 text-xs">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-4 w-4 text-brand-400" />
                  <div>
                    <p className="font-mono font-medium text-text-primary">
                      {item.filename}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {item.recordCount} records &bull; Filter: {item.filter.replace("_", " ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Explicit Data Retention & Privacy Policy Card */}
      <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <ShieldCheck className="h-4 w-4 text-brand-400" />
            <span>Privacy-Conscious Data Retention Policy</span>
          </div>

          <button
            type="button"
            onClick={handlePurgeHistory}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-surface-elevated transition-colors cursor-pointer border border-border-subtle"
            title="Purge all temporary session analysis records"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Purge Session Records</span>
          </button>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          <strong>Ephemeral Storage:</strong> Mailora does not store your email addresses, documents, or verification results in any server-side database. All completed analysis batches are held strictly in memory and ephemeral browser session storage (<code className="font-mono text-text-primary">sessionStorage</code>) for the duration of your active browser tab.
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          <strong>Automatic Deletion:</strong> All batch records and report previews are automatically purged the moment you close the browser tab. You may also click "Purge Session Records" above to delete all cached session data immediately.
        </p>
      </div>
    </div>
  );
}
