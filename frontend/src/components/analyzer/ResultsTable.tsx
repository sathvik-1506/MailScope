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

import { filterResults } from "../../utils/filterResults";

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

  // 2. Explicit loading state while analyzing an initial/cleared batch
  if (isLoading && results.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-secondary p-12 text-center shadow-card">
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          <p className="text-sm font-medium text-text-primary">
            Analyzing address batch...
          </p>
          <p className="text-xs text-text-muted">
            Executing RFC syntax rules, live DNS MX routing, and non-disruptive SMTP signals.
          </p>
        </div>
      </div>
    );
  }

  // 3. Empty state before any results are loaded
  if (results.length === 0 && !isLoading) {
    return <EmptyState onLoadSample={onLoadSample} />;
  }

  // 4. Centralized Filtering & Searching
  const filtered = filterResults(results, selectedVerdict, searchQuery);

  // 5. Sorting
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "address") {
      cmp = a.address.localeCompare(b.address);
    } else if (sortField === "verdict") {
      cmp = a.verdict.localeCompare(b.verdict);
    }
    return sortAsc ? cmp : -cmp;
  });

  // 6. No results state when filtered out
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
                SMTP Probe
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                Mailbox
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
              const isSyntaxValid = row.syntaxValidation === "VALID" || row.syntaxStatus === "passed";
              const isDnsConfigured = row.dnsMxValidation === "CONFIGURED" || row.dnsStatus === "passed";
              const isDnsNotConfigured = row.dnsMxValidation === "NOT_CONFIGURED" || row.dnsStatus === "failed";
              
              const smtpStatus =
                row.smtpProbe === "SUCCESS" || row.smtpStatus === "passed"
                  ? "passed"
                  : row.smtpProbe === "REJECTED" || row.smtpStatus === "failed"
                  ? "failed"
                  : row.smtpProbe === "UNAVAILABLE" || row.smtpStatus === "unavailable"
                  ? "unavailable"
                  : row.smtpProbe === "TIMEOUT" || row.smtpStatus === "inconclusive"
                  ? "inconclusive"
                  : "skipped";

              const smtpLabel =
                row.smtpProbe === "SUCCESS" || row.smtpStatus === "passed"
                  ? "Success"
                  : row.smtpProbe === "REJECTED" || row.smtpStatus === "failed"
                  ? "Rejected"
                  : row.smtpProbe === "UNAVAILABLE" || row.smtpStatus === "unavailable"
                  ? "Unavailable"
                  : row.smtpProbe === "TIMEOUT" || row.smtpStatus === "inconclusive"
                  ? "Timeout"
                  : "Not Tested";

              const mailboxStatus =
                row.mailboxExistence === "CONFIRMED"
                  ? "passed"
                  : row.mailboxExistence === "REJECTED" || row.mailboxExistence === "INVALID"
                  ? "failed"
                  : row.mailboxExistence === "UNCONFIRMED"
                  ? "inconclusive"
                  : "skipped";

              const mailboxLabel =
                row.mailboxExistence === "CONFIRMED"
                  ? "Confirmed"
                  : row.mailboxExistence === "REJECTED"
                  ? "Rejected"
                  : row.mailboxExistence === "UNCONFIRMED"
                  ? "Unconfirmed"
                  : row.mailboxExistence === "INVALID"
                  ? "Invalid"
                  : "Unknown";

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
                      <span className="truncate max-w-[200px] sm:max-w-[240px]" title={row.address}>
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
                    <CheckStatusPill
                      status={isSyntaxValid ? "passed" : "failed"}
                      label={isSyntaxValid ? "Valid" : "Invalid"}
                      compact
                    />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill
                      status={isDnsConfigured ? "passed" : isDnsNotConfigured ? "failed" : "inconclusive"}
                      label={isDnsConfigured ? "Configured" : isDnsNotConfigured ? "Not Configured" : "Unknown"}
                      compact
                    />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill
                      status={smtpStatus}
                      label={smtpLabel}
                      title={
                        smtpLabel === "Unavailable"
                          ? "Unavailable from the current hosting environment"
                          : undefined
                      }
                      compact
                    />
                  </td>
                  <td className="px-3 py-3.5 text-center whitespace-nowrap">
                    <CheckStatusPill
                      status={mailboxStatus}
                      label={mailboxLabel}
                      title={
                        mailboxLabel === "Unconfirmed"
                          ? "Mailbox existence unconfirmed without direct SMTP probe"
                          : undefined
                      }
                      compact
                    />
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
          Status legend: Valid / Configured / Confirmed (green) &bull; Unconfirmed / Timeout (amber) &bull; Invalid / Rejected (red) &bull; Unavailable (zinc) &bull; Not Tested (slate)
        </div>
      </div>
    </div>
  );
}
