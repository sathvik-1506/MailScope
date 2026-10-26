import { Search, Download, RotateCcw, X } from "lucide-react";
import type { Verdict } from "../../types";

interface ResultsFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedVerdict: Verdict | "all";
  onVerdictChange: (v: Verdict | "all") => void;
  totalCount: number;
  filteredCount: number;
  onExportCsv: () => void;
  onResetWorkspace: () => void;
  isExporting?: boolean;
}

export default function ResultsFilterBar({
  searchQuery,
  onSearchChange,
  selectedVerdict,
  onVerdictChange,
  totalCount,
  filteredCount,
  onExportCsv,
  onResetWorkspace,
}: ResultsFilterBarProps) {
  const tabs: { id: Verdict | "all"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "likely_delivered", label: "Likely Delivered" },
    { id: "likely_bounce", label: "Likely Bounce" },
    { id: "unknown", label: "Unknown" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-secondary p-4 shadow-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by address, domain, or keyword..."
            aria-label="Filter results table"
            className="w-full rounded-lg border border-border-subtle bg-surface-primary pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Global Table Actions: Export & Reset */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={totalCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-card hover:border-brand-400/40 transition-colors disabled:opacity-40 cursor-pointer"
            title="Export filtered records to sanitized CSV format"
          >
            <Download className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
            <span>Export CSV ({filteredCount})</span>
          </button>

          <button
            type="button"
            onClick={onResetWorkspace}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-primary px-3 py-2 text-xs font-medium text-text-secondary hover:text-rose-400 hover:border-rose-500/30 hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Reset workspace results and input"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Reset Workspace</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Count summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle/60">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Verdict Filter">
          {tabs.map((t) => {
            const active = selectedVerdict === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onVerdictChange(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-text-muted font-mono">
          Showing {filteredCount} of {totalCount} records
        </div>
      </div>
    </div>
  );
}
