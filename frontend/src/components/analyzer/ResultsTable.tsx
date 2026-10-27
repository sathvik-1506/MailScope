import { useState } from "react";
import {
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { DetailedAddressResult, Verdict } from "../../types";
import { VERDICT_META } from "../../types";
import Badge from "../Badge";
import CheckStatusPill from "./CheckStatusPill";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import NoResultsState from "./NoResultsState";

interface ResultsTableProps {
  results: DetailedAddressResult[];
  searchQuery: string;
  selectedVerdict: Verdict | "all";
  onSelectRecord: (record: DetailedAddressResult) => void;
  onLoadSample: () => void;
  onClearFilters: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onDismissError?: () => void;
}

export default function ResultsTable({
  results,
  searchQuery,
  selectedVerdict,
  onSelectRecord,
  onLoadSample,
  onClearFilters,
  isLoading,
  errorMessage,
  onRetry,
  onDismissError,
}: ResultsTableProps) {
  const [sortField, setSortField] = useState<"address" | "verdict">("address");
  const [sortAsc, setSortAsc] = useState(true);

  // 1. Error state takes priority
  if (errorMessage) {
    return (
      <ErrorState
        message={errorMessage}
        onRetry={onRetry}
        onDismiss={onDismissError}
      />
    );
  }

  // 2. Empty state before any results are loaded
  if (results.length === 0 && !isLoading) {
    return <EmptyState onLoadSample={onLoadSample} />;
  }

  // 3. Filtering & Searching
  const filtered = results.filter((r) => {
    // Verdict filter
    if (selectedVerdict !== "all" && r.verdict !== selectedVerdict) {
      return false;
    }
    // Search query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchAddress = r.address.toLowerCase().includes(q);
      const matchReason = r.reason.toLowerCase().includes(q);
      const matchEvidence = r.evidence.some((e) => e.toLowerCase().includes(q));
      if (!matchAddress && !matchReason && !matchEvidence) {
        return false;
      }
    }
    return true;
  });

  // 4. Sorting
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "address") {
      cmp = a.address.localeCompare(b.address);
    } else if (sortField === "verdict") {
      cmp = a.verdict.localeCompare(b.verdict);
    }
    return sortAsc ? cmp : -cmp;
  });

  // 5. No results state when filtered out
  if (sorted.length === 0 && !isLoading) {
    return (
      <NoResultsState
        searchQuery={searchQuery}
        hasFilter={selectedVerdict !== "all"}
        onClearFilters={onClearFilters}
      />
    );
  }

  const handleSort = (field: "address" | "verdict") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
      {/* Table container with responsive horizontal scroll */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]" role="table">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-elevated/60 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("address")}
                  className="flex items-center gap-1.5 hover:text-text-primary cursor-pointer select-none"
                >
                  <span>Email Address</span>
                  <span className="font-mono text-[10px]">
                    {sortField === "address" ? (sortAsc ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("verdict")}
                  className="flex items-center gap-1.5 hover:text-text-primary cursor-pointer select-none"
                >
                  <span>Verdict</span>
                  <span className="font-mono text-[10px]">
                    {sortField === "verdict" ? (sortAsc ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                Syntax
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                DNS / MX
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                Routing
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                SMTP
              </th>
              <th scope="col" className="px-4 py-3.5">
                Technical Assessment / Reason
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Evidence
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle text-xs text-text-secondary">
            {sorted.map((row) => {
              const meta = VERDICT_META[row.verdict];
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectRecord(row)}
                  className="group hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={`View evidence details for ${row.address}, verdict ${meta.label}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRecord(row);
                    }
                  }}
                >
                  {/* Address */}
                  <td className="px-4 py-3.5 font-mono text-text-primary font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[200px] sm:max-w-[240px]">
                        {row.address}
                      </span>
                      {row.isFixture && (
                        <span
                          className="shrink-0 text-[10px] text-brand-400/80 font-mono"
                          title="RFC 2606 Test Fixture"
                        >
                          <Sparkles className="h-3 w-3 inline" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Verdict Badge */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Badge color={meta.badgeColor}>
                      {meta.label}
                    </Badge>
                  </td>

                  {/* Check Pillars */}
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill status={row.syntaxStatus} compact />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill status={row.dnsStatus} compact />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill status={row.routingStatus} compact />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill status={row.smtpStatus} compact />
                  </td>

                  {/* Reason summary */}
                  <td className="px-4 py-3.5 max-w-[260px]">
                    <span className="truncate block text-text-secondary" title={row.reason}>
                      {row.reason}
                    </span>
                  </td>

                  {/* Details Action */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRecord(row);
                      }}
                      className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-brand-400 group-hover:bg-brand-500/10 group-hover:text-brand-300 transition-colors cursor-pointer"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer with quick info */}
      <div className="border-t border-border-subtle bg-surface-elevated/30 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
        <div>
          Click any row to open the full <strong className="text-text-secondary font-medium">Evidence Ledger</strong> and limitations breakdown.
        </div>
        <div className="font-mono text-[11px]">
          Status legend: Passed (green) &bull; Failed (red) &bull; Inconclusive (amber) &bull; Skipped (gray)
        </div>
      </div>
    </div>
  );
}
