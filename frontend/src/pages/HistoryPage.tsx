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
} from "lucide-react";
import { useState } from "react";
import { useAnalysis, type AnalysisBatchRecord } from "../context/AnalysisContext";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { downloadResultsCsv } from "../utils/csvExport";

export default function HistoryPage() {
  const { batchHistory, clearHistory, setResults, logExport } = useAnalysis();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleInspectBatch = (batch: AnalysisBatchRecord) => {
    setResults(batch.results);
    navigate("/app/analyze");
  };

  const handleExportBatch = (batch: AnalysisBatchRecord) => {
    const filename = downloadResultsCsv(batch.results);
    logExport(filename, batch.results.length, "all");
  };

  const filteredHistory = batchHistory.filter(
    (b) =>
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            Audit previous verification runs executed during this session. Re-load any batch back into the analyzer or download sanitized CSV records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {batchHistory.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer"
              title="Clear all session batch records"
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

      {batchHistory.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <History className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            No Previous Analysis Runs
          </h3>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Every email batch analyzed during your workspace session is automatically cataloged here for quick review, filtering, and export.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <MailCheck className="h-4 w-4 mr-2" />
              <span>Start Analyzing Addresses</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search bar if multiple batches */}
          {batchHistory.length > 2 && (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history by batch title or ID..."
                className="w-full rounded-lg border border-border-subtle bg-surface-secondary pl-9 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          )}

          {/* Batches Table */}
          <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-elevated/60 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    <th scope="col" className="px-5 py-3.5">
                      Batch Details
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Timestamp
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Addresses
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Verdict Breakdown
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs text-text-secondary">
                  {filteredHistory.map((batch) => (
                    <tr
                      key={batch.id}
                      className="hover:bg-surface-elevated/40 transition-colors"
                    >
                      <td className="px-5 py-4 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{batch.title}</span>
                          {batch.smtpProbed && (
                            <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-400 border border-brand-500/20">
                              SMTP
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-text-muted">
                          ID: {batch.id}
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap text-text-muted">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Clock className="h-3.5 w-3.5 text-text-muted/60" />
                          <span>{new Date(batch.timestamp).toLocaleDateString()} {new Date(batch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap font-mono font-medium text-text-primary">
                        {batch.addressesCount}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge color="delivered">{batch.deliveredCount}</Badge>
                          <Badge color="bounce">{batch.bounceCount}</Badge>
                          <Badge color="unknown">{batch.unknownCount}</Badge>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportBatch(batch)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border-subtle bg-surface-primary text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                            title="Export this batch as sanitized CSV"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">CSV</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInspectBatch(batch)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors cursor-pointer shadow-sm"
                            title="Load batch into Analyzer workspace"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Guarantee Note */}
      <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-secondary/60 p-4 text-xs text-text-muted">
        <ShieldCheck className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          History records are stored strictly in your browser session for this workspace visit and are cleared automatically when you close or reset the session.
        </p>
      </div>
    </div>
  );
}
