import {
  Download,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import Button from "../components/Button";
import { downloadResultsCsv } from "../utils/csvExport";

export default function ExportsPage() {
  const { results, exportHistory, logExport } = useAnalysis();

  const delivered = results.filter((r) => r.verdict === "likely_delivered");
  const bounce = results.filter((r) => r.verdict === "likely_bounce");
  const unknown = results.filter((r) => r.verdict === "unknown");

  const handleExportAll = () => {
    if (results.length === 0) return;
    const filename = downloadResultsCsv(results);
    logExport(filename, results.length, "all");
  };

  const handleExportDelivered = () => {
    if (delivered.length === 0) return;
    const filename = downloadResultsCsv(delivered);
    logExport(filename, delivered.length, "likely_delivered");
  };

  const handleExportBounce = () => {
    if (bounce.length === 0) return;
    const filename = downloadResultsCsv(bounce);
    logExport(filename, bounce.length, "likely_bounce");
  };

  const handleExportUnknown = () => {
    if (unknown.length === 0) return;
    const filename = downloadResultsCsv(unknown);
    logExport(filename, unknown.length, "unknown");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Data Management
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Export Center
          </h1>
          <p className="mt-1 text-sm text-text-secondary max-w-2xl">
            Generate and download sanitized, RFC 4180-compliant CSV datasets with built-in protection against spreadsheet formula injection (CWE-1236).
          </p>
        </div>

        {results.length > 0 && (
          <div className="flex items-center gap-3">
            <Button size="md" onClick={handleExportAll}>
              <Download className="h-4 w-4 mr-2" />
              <span>Export Full Batch ({results.length})</span>
            </Button>
          </div>
        )}
      </div>

      {/* 2. Export Presets Grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
          Available Export Formats & Subsets
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Full Batch */}
          <div className="rounded-xl border border-border-default bg-surface-secondary p-5 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Complete Results</span>
                <Layers className="h-4 w-4 text-text-muted" />
              </div>
              <h3 className="mt-3 text-base font-bold text-text-primary">
                All Analyzed Records
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Includes all email addresses, classifications, technical assessments, and pipeline checks.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={handleExportAll}
                disabled={results.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-surface-elevated text-xs font-medium text-text-primary hover:bg-surface-card border border-border-subtle transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5 text-brand-400" />
                <span>Download CSV ({results.length})</span>
              </button>
            </div>
          </div>

          {/* Likely Delivered Only */}
          <div className="rounded-xl border border-delivered/30 bg-surface-secondary p-5 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Clean Mailbox List</span>
                <CheckCircle2 className="h-4 w-4 text-delivered" />
              </div>
              <h3 className="mt-3 text-base font-bold text-delivered">
                Likely Delivered Only
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Cleaned list ready for sending campaigns, free of invalid domains and rejected mailboxes.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={handleExportDelivered}
                disabled={delivered.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-delivered/10 text-xs font-medium text-delivered hover:bg-delivered/20 border border-delivered/20 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Delivered ({delivered.length})</span>
              </button>
            </div>
          </div>

          {/* Likely Bounce Only */}
          <div className="rounded-xl border border-bounce/30 bg-surface-secondary p-5 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Suppression List</span>
                <XCircle className="h-4 w-4 text-bounce" />
              </div>
              <h3 className="mt-3 text-base font-bold text-bounce">
                Likely Bounce Only
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Confirmed invalid addresses to add directly into your sender suppression list or CRM blacklists.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={handleExportBounce}
                disabled={bounce.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-bounce/10 text-xs font-medium text-bounce hover:bg-bounce/20 border border-bounce/20 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Bounce ({bounce.length})</span>
              </button>
            </div>
          </div>

          {/* Unknown / Inconclusive */}
          <div className="rounded-xl border border-unknown/30 bg-surface-secondary p-5 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Needs Followup</span>
                <HelpCircle className="h-4 w-4 text-unknown" />
              </div>
              <h3 className="mt-3 text-base font-bold text-unknown">
                Unknown Records
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Addresses that timed out or hit temporary greylisting, recommended for re-testing later.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={handleExportUnknown}
                disabled={unknown.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-unknown/10 text-xs font-medium text-unknown hover:bg-unknown/20 border border-unknown/20 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Unknown ({unknown.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Empty State or Download Ledger */}
      {results.length === 0 && exportHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-400 border border-brand-500/20 mb-4 shadow-sm">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            No Active Datasets Ready for Export
          </h3>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Exports are generated from live batch verifications. Analyze a list of addresses in the workspace to unlock customized CSV downloads.
          </p>
          <div className="mt-6 flex justify-center">
            <Button to="/app/analyze" size="md">
              <span>Go to Analyze Emails</span>
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Export History in Current Session */
        <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
          <div className="border-b border-border-subtle px-6 py-4 bg-surface-elevated/40">
            <h2 className="text-base font-semibold text-text-primary">
              Session Export History
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Files generated and downloaded during your current session.
            </p>
          </div>

          {exportHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted">
              No files downloaded yet in this session. Click any export preset above to download.
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
      )}

      {/* 4. Security & RFC Compliance Note */}
      <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-secondary/60 p-4 text-xs text-text-muted">
        <ShieldCheck className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>CWE-1236 Defense:</strong> All exported CSV records are sanitized to prevent CSV/Formula injection attacks. Fields beginning with formula trigger characters (=, +, -, @, tab, or carriage returns) are safely neutralised with leading single quotes.
        </p>
      </div>
    </div>
  );
}
