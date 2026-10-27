/**
 * Shared TypeScript types for Mailora frontend.
 *
 * These mirror the backend's classification model so that API responses
 * can be typed end-to-end without code generation.
 */

// ---------------------------------------------------------------------------
// Enumerations & Check Statuses
// ---------------------------------------------------------------------------

export type Verdict = "likely_delivered" | "likely_bounce" | "unknown";

export type SMTPStatus = "accepted" | "rejected" | "inconclusive" | "disabled";

export type DNSStatus = "has_mx" | "has_a" | "no_records" | "timeout" | "servfail" | "error";

export type CheckStatus = "passed" | "failed" | "inconclusive" | "skipped" | "unavailable";

export type CheckCategory = "syntax" | "dns" | "routing" | "smtp";

export interface CheckItem {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Analysis request / response shapes
// ---------------------------------------------------------------------------

export interface AnalysisRequest {
  /** Raw email addresses to analyse – one per element. */
  addresses: string[];
  /** Whether to run SMTP probing. Defaults to false on the backend. */
  smtp_enabled?: boolean;
}

export interface SyntaxEvidence {
  valid: boolean;
  normalized?: string | null;
  reason: string;
}

export interface DNSEvidence {
  status: string;
  state?: "passed" | "failed" | "inconclusive" | "unavailable" | "skipped";
  domain?: string;
  mx_hosts?: string[];
  invalid_mx_hosts?: string[];
  unresolvable_mx_hosts?: string[];
  has_implicit_mx?: boolean;
  is_nxdomain?: boolean;
  is_nodata?: boolean;
  is_null_mx?: boolean;
  reason: string;
}

export interface SMTPEvidence {
  status: string;
  smtp_code?: number | null;
  reason: string;
}

export interface BackendAddressResult {
  address: string;
  original_input?: string;
  normalized_address?: string | null;
  verdict: Verdict;
  reason_code: string;
  explanation: string;
  syntax_evidence?: SyntaxEvidence;
  dns_evidence?: DNSEvidence;
  smtp_evidence?: SMTPEvidence;
  checks_run?: string[];
  checks_skipped?: string[];
  evidence: string[];
  limitations: string[];
  analysed_at?: string;
}

export interface BackendAnalysisResponse {
  results: BackendAddressResult[];
  count: number;
  analysed_at: string;
}

// Backward-compatible alias
export interface AddressResult extends BackendAddressResult {}
export interface AnalysisResponse extends BackendAnalysisResponse {}

// ---------------------------------------------------------------------------
// Granular / Detailed Result used in the Workspace UI
// ---------------------------------------------------------------------------

export interface DetailedAddressResult {
  id: string;
  address: string;
  originalInput?: string;
  normalizedAddress?: string | null;
  verdict: Verdict;
  reason: string;
  reasonCode?: string;
  syntaxStatus: CheckStatus;
  dnsStatus: CheckStatus;
  routingStatus: CheckStatus;
  smtpStatus: CheckStatus;
  checks: CheckItem[];
  evidence: string[];
  limitations: string[];
  isFixture?: boolean;
  analysedAt?: string;
}

// ---------------------------------------------------------------------------
// UI helpers & Status Metadata
// ---------------------------------------------------------------------------

export interface VerdictMeta {
  label: string;
  badgeColor: "delivered" | "bounce" | "unknown";
  colorClass: string;
  description: string;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  likely_delivered: {
    label: "Likely delivered",
    badgeColor: "delivered",
    colorClass: "text-delivered",
    description: "Technical evidence indicates this address appears deliverable.",
  },
  likely_bounce: {
    label: "Likely bounce",
    badgeColor: "bounce",
    colorClass: "text-bounce",
    description: "Technical evidence indicates this address is likely to bounce.",
  },
  unknown: {
    label: "Unknown",
    badgeColor: "unknown",
    colorClass: "text-unknown",
    description: "Evidence is inconclusive or insufficient for verification.",
  },
};

export interface CheckStatusMeta {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const CHECK_STATUS_META: Record<CheckStatus, CheckStatusMeta> = {
  passed: {
    label: "Passed",
    bgClass: "bg-emerald-500/15 dark:bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-600/30 dark:border-emerald-500/30",
  },
  failed: {
    label: "Failed",
    bgClass: "bg-rose-500/15 dark:bg-rose-500/10",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-600/30 dark:border-rose-500/30",
  },
  inconclusive: {
    label: "Inconclusive",
    bgClass: "bg-amber-500/15 dark:bg-amber-500/10",
    textClass: "text-amber-800 dark:text-amber-300",
    borderClass: "border-amber-600/30 dark:border-amber-500/30",
  },
  skipped: {
    label: "Skipped",
    bgClass: "bg-slate-500/15 dark:bg-slate-500/10",
    textClass: "text-slate-700 dark:text-slate-400",
    borderClass: "border-slate-600/30 dark:border-slate-500/30",
  },
  unavailable: {
    label: "Unavailable",
    bgClass: "bg-zinc-500/15 dark:bg-zinc-500/10",
    textClass: "text-zinc-700 dark:text-zinc-400",
    borderClass: "border-zinc-600/30 dark:border-zinc-500/30",
  },
};

// ---------------------------------------------------------------------------
// Document Email Extraction Shapes
// ---------------------------------------------------------------------------

export interface ExtractedSourceReference {
  file: string;
  location: string;
}

export interface ExtractedCandidate {
  address: string;
  normalized: string;
  source_file: string;
  location: string;
  all_sources: ExtractedSourceReference[];
  occurrences: number;
}

export interface ExtractionFileReport {
  filename: string;
  size_bytes: number;
  status: "success" | "warning" | "error";
  candidates_found: number;
  warnings: string[];
}

export interface ExtractionResponse {
  candidates: ExtractedCandidate[];
  unique_count: number;
  total_detected: number;
  duplicates_removed: number;
  files: ExtractionFileReport[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Analysis History Record Shapes
// ---------------------------------------------------------------------------

export interface DomainFrequency {
  domain: string;
  count: number;
}

export interface HistoryRunSummary {
  id: string;
  created_at: string;
  status: "completed" | "failed" | string;
  addresses_count: number;
  delivered_count: number;
  bounce_count: number;
  unknown_count: number;
  smtp_enabled: boolean;
  domains_summary: DomainFrequency[];
  has_detailed_results: boolean;
}

export interface HistoryListResponse {
  items: HistoryRunSummary[];
  total: number;
  page: number;
  limit: number;
  retention_days: number;
}


