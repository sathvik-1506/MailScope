/**
 * Centralized typed API client for the Mailora backend service.
 *
 * Configured via VITE_API_BASE_URL (or VITE_API_URL fallback).
 */

import { BRAND } from "../constants/brand";
import type {
  AnalysisRequest,
  BackendAddressResult,
  DetailedAddressResult,
  CheckStatus,
  CheckItem,
  Verdict,
  ExtractionResponse,
  HistoryListResponse,
  SyntaxValidationStatus,
  DNSValidationStatus,
  SMTPProbeStatusType,
  MailboxExistenceStatus,
} from "../types";



// Read API base URL per Requirement 2
export const API_BASE_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:5000";


/**
 * Custom error class for API failures.
 * Clearly separates transport/network/service errors from email classification verdicts.
 */
export class APIClientError extends Error {
  public status?: number;
  public code?: string;
  public isNetworkError: boolean;

  constructor(message: string, status?: number, code?: string, isNetworkError = false) {
    super(message);
    this.name = "APIClientError";
    this.status = status;
    this.code = code;
    this.isNetworkError = isNetworkError;
  }
}

/**
 * Maps a single BackendAddressResult from POST /api/analyze into a
 * UI-ready DetailedAddressResult for the workspace.
 */
export function mapBackendToDetailedResult(
  backendResult: BackendAddressResult,
  idx: number
): DetailedAddressResult {
  // Defensive guard against malformed or non-object items in backend responses
  if (!backendResult || typeof backendResult !== "object") {
    return {
      id: `res-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      address: "unknown",
      originalInput: "unknown",
      normalizedAddress: null,
      verdict: "unknown",
      reason: "Malformed record returned by backend.",
      reasonCode: "MALFORMED_RECORD",
      syntaxStatus: "unavailable",
      dnsStatus: "unavailable",
      routingStatus: "unavailable",
      smtpStatus: "unavailable",
      checks: [],
      evidence: [],
      limitations: [],
      isFixture: false,
      analysedAt: new Date().toISOString(),
    };
  }

  const {
    address = "unknown",
    original_input,
    normalized_address,
    verdict: rawVerdict,
    reason_code = "UNKNOWN",
    explanation,
    syntax_evidence,
    dns_evidence,
    smtp_evidence,
    checks_run = [],
    checks_skipped = [],
    evidence = [],
    limitations = [],
    analysed_at,
  } = backendResult;

  // Validate verdict against allowed classifications
  const verdict: Verdict =
    rawVerdict === "likely_delivered" ||
    rawVerdict === "likely_bounce" ||
    rawVerdict === "unknown"
      ? rawVerdict
      : "unknown";

  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  const safeLimitations = Array.isArray(limitations) ? limitations : [];
  const safeChecksRun = Array.isArray(checks_run) ? checks_run : [];
  const safeChecksSkipped = Array.isArray(checks_skipped) ? checks_skipped : [];

  // 1. Determine syntax check status
  let syntaxStatus: CheckStatus = "unavailable";
  if (safeChecksSkipped.includes("syntax")) {
    syntaxStatus = "skipped";
  } else if (syntax_evidence && typeof syntax_evidence.valid === "boolean") {
    syntaxStatus = syntax_evidence.valid ? "passed" : "failed";
  } else if (safeChecksRun.length > 0 && !safeChecksRun.includes("syntax")) {
    syntaxStatus = "skipped";
  } else {
    syntaxStatus = "unavailable";
  }

  // 2. Determine DNS resolution status
  let dnsStatus: CheckStatus = "unavailable";
  if (safeChecksSkipped.includes("dns")) {
    dnsStatus = "skipped";
  } else if (dns_evidence && typeof dns_evidence === "object") {
    if (
      dns_evidence.state &&
      ["passed", "failed", "inconclusive", "unavailable", "skipped"].includes(
        dns_evidence.state
      )
    ) {
      dnsStatus = dns_evidence.state as CheckStatus;
    } else {
      const s = dns_evidence.status;
      if (s === "has_mx" || s === "has_a") {
        dnsStatus = "passed";
      } else if (s === "no_records") {
        dnsStatus = "failed";
      } else if (s === "timeout" || s === "servfail" || s === "error") {
        dnsStatus = "inconclusive";
      } else {
        dnsStatus = "unavailable";
      }
    }
  } else if (safeChecksRun.length > 0 && !safeChecksRun.includes("dns")) {
    dnsStatus = "skipped";
  } else {
    dnsStatus = "unavailable";
  }

  // 3. Determine routing status
  let routingStatus: CheckStatus = "unavailable";
  if (safeChecksSkipped.includes("dns")) {
    routingStatus = "skipped";
  } else if (dnsStatus === "inconclusive") {
    routingStatus = "inconclusive";
  } else if (dnsStatus === "unavailable") {
    routingStatus = "unavailable";
  } else if (dns_evidence && typeof dns_evidence === "object") {
    if (dns_evidence.has_implicit_mx || dns_evidence.status === "has_a") {
      routingStatus = "passed";
    } else if (dns_evidence.status === "has_mx") {
      routingStatus = "passed";
    } else {
      routingStatus = "failed";
    }
  } else if (safeChecksRun.length > 0 && !safeChecksRun.includes("dns")) {
    routingStatus = "skipped";
  } else {
    routingStatus = "unavailable";
  }

  // 4. Determine SMTP status
  let smtpStatus: CheckStatus = "skipped";
  if (safeChecksSkipped.includes("smtp")) {
    smtpStatus = "skipped";
  } else if (smtp_evidence && typeof smtp_evidence === "object") {
    const s = smtp_evidence.status;
    if (s === "disabled") {
      smtpStatus = "skipped";
    } else if (s === "accepted") {
      smtpStatus = "passed";
    } else if (s === "rejected") {
      smtpStatus = "failed";
    } else if (s === "unavailable" || reason_code === "SMTP_UNAVAILABLE") {
      smtpStatus = "unavailable";
    } else if (s === "timeout" || s === "inconclusive" || s === "error") {
      smtpStatus = "inconclusive";
    } else {
      smtpStatus = "inconclusive";
    }
  } else if (safeChecksRun.length > 0 && !safeChecksRun.includes("smtp")) {
    smtpStatus = "skipped";
  } else {
    smtpStatus = "unavailable";
  }

    // 5. Determine independent check dimensions
    const syntaxValidation: SyntaxValidationStatus =
      backendResult.syntax_validation ||
      (syntaxStatus === "passed" ? "VALID" : "INVALID");

    const dnsMxValidation: DNSValidationStatus =
      backendResult.dns_mx_validation ||
      (dnsStatus === "passed" || routingStatus === "passed"
        ? "CONFIGURED"
        : dnsStatus === "inconclusive"
        ? "UNKNOWN"
        : "NOT_CONFIGURED");

    const smtpProbe: SMTPProbeStatusType =
      backendResult.smtp_probe ||
      (smtpStatus === "passed"
        ? "SUCCESS"
        : smtpStatus === "failed"
        ? "REJECTED"
        : smtpStatus === "unavailable" || reason_code === "SMTP_UNAVAILABLE"
        ? "UNAVAILABLE"
        : smtpStatus === "skipped"
        ? "NOT_TESTED"
        : "TIMEOUT");

    const mailboxExistence: MailboxExistenceStatus =
      backendResult.mailbox_existence ||
      (smtpProbe === "SUCCESS"
        ? "CONFIRMED"
        : smtpProbe === "REJECTED"
        ? "REJECTED"
        : syntaxValidation === "INVALID" || dnsMxValidation === "NOT_CONFIGURED"
        ? "INVALID"
        : dnsMxValidation === "UNKNOWN"
        ? "UNKNOWN"
        : "UNCONFIRMED");

  // 6. Construct granular pipeline checks
  const checks: CheckItem[] = [
    {
      id: `chk-${idx}-1`,
      category: "syntax",
      name: "RFC 5321/5322 Syntax Format",
      status: syntaxStatus,
      detail:
        syntax_evidence?.reason ??
        (syntaxValidation === "VALID"
          ? "Address format satisfies RFC specification."
          : syntaxStatus === "skipped"
          ? "Syntax validation skipped."
          : "Syntax validation failed or invalid."),
    },
    {
      id: `chk-${idx}-2`,
      category: "dns",
      name: "DNS Domain Resolution",
      status: dnsStatus,
      detail:
        dns_evidence?.reason ??
        (dnsStatus === "passed"
          ? "Domain resolves with active nameservers."
          : dnsStatus === "inconclusive"
          ? "DNS resolution timed out or nameserver returned SERVFAIL."
          : dnsStatus === "skipped"
          ? "DNS resolution skipped."
          : "DNS domain resolution failed or unavailable."),
    },
    {
      id: `chk-${idx}-3`,
      category: "routing",
      name: "Mail Routing Targets (MX / Implicit Fallback)",
      status: routingStatus,
      detail:
        dns_evidence?.has_implicit_mx
          ? "No MX record; fallback A/AAAA records act as implicit MX (RFC 5321 § 5.1)."
          : dns_evidence?.mx_hosts && dns_evidence.mx_hosts.length > 0
          ? `Authoritative MX host(s): ${dns_evidence.mx_hosts.join(", ")}`
          : routingStatus === "inconclusive"
          ? "Routing targets could not be determined due to DNS resolver timeout or failure."
          : routingStatus === "skipped"
          ? "Mail routing analysis skipped."
          : "No mail routing destination found.",
    },
    {
      id: `chk-${idx}-4`,
      category: "smtp",
      name: "SMTP Recipient Handshake (RCPT TO)",
      status: smtpStatus,
      detail:
        smtp_evidence?.reason ??
        (smtpProbe === "NOT_TESTED" || smtpStatus === "skipped"
          ? "SMTP verification was not enabled for this request."
          : smtpProbe === "UNAVAILABLE" || smtpStatus === "unavailable"
          ? "Unavailable from current hosting environment: Outbound port 25 connection blocked or unreachable."
          : smtpProbe === "TIMEOUT"
          ? "SMTP probe connection or handshake timed out."
          : smtpProbe === "REJECTED"
          ? "Target server explicitly rejected recipient during handshake."
          : "SMTP handshake evaluation completed."),
    },
  ];

  return {
    id: `res-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    address,
    originalInput: original_input ?? address,
    normalizedAddress: normalized_address ?? null,
    verdict,
    reason: explanation || safeEvidence[0] || "Analysis complete.",
    reasonCode: reason_code,
    syntaxValidation,
    dnsMxValidation,
    smtpProbe,
    mailboxExistence,
    syntaxStatus,
    dnsStatus,
    routingStatus,
    smtpStatus,
    checks,
    evidence: safeEvidence,
    limitations: safeLimitations,
    isFixture: false,
    analysedAt: analysed_at ?? new Date().toISOString(),
  };
}

/**
 * Health check endpoint.
 */
export async function healthCheck(): Promise<{ status: string; service: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new APIClientError(`Health check returned status ${res.status}`, res.status);
    }
    return (await res.json()) as { status: string; service: string };
  } catch (err: unknown) {
    if (err instanceof APIClientError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new APIClientError(
      `Cannot connect to ${BRAND.name} API at ${API_BASE_URL} (${msg})`,
      undefined,
      "NETWORK_ERROR",
      true
    );
  }
}

/**
 * Sends submitted email addresses to POST /api/analyze on the backend.
 *
 * @param payload - addresses to analyze and optional smtp_enabled flag
 * @param timeoutMs - optional request timeout in milliseconds (default 30,000ms)
 */
export async function analyzeAddresses(
  payload: AnalysisRequest,
  timeoutMs = 30000
): Promise<DetailedAddressResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        addresses: payload.addresses,
        smtp_enabled: payload.smtp_enabled ?? true,
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new APIClientError(
        `Request timed out after ${timeoutMs / 1000} seconds. The backend verification engine may be waiting on slow external DNS or SMTP servers.`,
        408,
        "TIMEOUT",
        true
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new APIClientError(
      `Could not establish connection to ${BRAND.name} backend service at ${API_BASE_URL}. Please ensure the backend is running. (${msg})`,
      undefined,
      "CONNECTION_REFUSED",
      true
    );
  } finally {
    clearTimeout(timer);
  }

  // Parse response
  let data: any;
  const rawText = await response.text();
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new APIClientError(
      `Backend returned an invalid non-JSON response (HTTP ${response.status}).`,
      response.status,
      "INVALID_JSON"
    );
  }

  if (!response.ok) {
    const errorMsg = data?.error || `API returned HTTP ${response.status}`;
    const code = data?.code || "API_ERROR";
    throw new APIClientError(errorMsg, response.status, code);
  }

  if (!data || !Array.isArray(data.results)) {
    throw new APIClientError(
      "Backend response schema violated: expected 'results' array.",
      response.status,
      "SCHEMA_ERROR"
    );
  }

  // Map each backend result into a DetailedAddressResult
  const mapped = (data.results as BackendAddressResult[]).map((r, i) =>
    mapBackendToDetailedResult(r, i)
  );
  if (data.batch_id && typeof data.batch_id === "string") {
    Object.defineProperty(mapped, "batchId", {
      value: data.batch_id,
      enumerable: false,
      configurable: true,
    });
  }
  return mapped;

}

/**
 * Uploads one or more supported documents (.txt, .csv, .pdf, .docx, .eml) to the
 * Mailora backend extraction endpoint to parse and detect candidate email addresses.
 *
 * @param files - List of File objects from browser file input or drag-and-drop
 * @param timeoutMs - Request timeout in milliseconds (default 45,000ms)
 * @returns Structured extraction summary including candidates, counts, and per-file reports
 */
export async function extractEmailsFromFiles(
  files: File[],
  timeoutMs = 45000
): Promise<ExtractionResponse> {
  if (!files || files.length === 0) {
    throw new APIClientError("No files selected for extraction.", 400, "NO_FILES_PROVIDED");
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file, file.name);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/extract`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new APIClientError(
        `Extraction request timed out after ${timeoutMs / 1000} seconds. Please verify file sizes and connectivity.`,
        408,
        "TIMEOUT",
        true
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new APIClientError(
      `Could not establish connection to ${BRAND.name} backend service at ${API_BASE_URL}. Please ensure the backend is running. (${msg})`,
      undefined,
      "CONNECTION_REFUSED",
      true
    );
  } finally {
    clearTimeout(timer);
  }

  let data: any;
  const rawText = await response.text();
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new APIClientError(
      `Backend returned an invalid non-JSON response (HTTP ${response.status}).`,
      response.status,
      "INVALID_JSON"
    );
  }

  if (!response.ok) {
    const errorMsg = data?.error || `Document extraction failed (HTTP ${response.status})`;
    const code = data?.code || "EXTRACTION_ERROR";
    throw new APIClientError(errorMsg, response.status, code);
  }

  if (!data || !Array.isArray(data.candidates) || !Array.isArray(data.files)) {
    throw new APIClientError(
      "Backend response schema violated: expected 'candidates' and 'files' arrays.",
      response.status,
      "SCHEMA_ERROR"
    );
  }

  return data as ExtractionResponse;
}

// ---------------------------------------------------------------------------
// Analysis History API Operations
// ---------------------------------------------------------------------------

export interface HistoryQueryOptions {
  q?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

/**
 * Queries analysis runs from the backend history ledger with optional filters.
 */
export async function fetchHistoryRuns(
  options: HistoryQueryOptions = {},
  timeoutMs = 10000
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.start_date) params.set("start_date", options.start_date);
  if (options.end_date) params.set("end_date", options.end_date);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));

  const qs = params.toString();
  const url = `${API_BASE_URL}/api/history${qs ? `?${qs}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new APIClientError(`Failed to fetch history (HTTP ${response.status})`, response.status);
    }

    const data = await response.json();
    return data as HistoryListResponse;
  } catch (err: unknown) {
    if (err instanceof APIClientError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new APIClientError(`History fetch failed: ${msg}`, undefined, "NETWORK_ERROR", true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deletes a single history run by ID.
 */
export async function deleteHistoryRun(runId: string, timeoutMs = 8000): Promise<boolean> {
  if (!runId) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/history/${encodeURIComponent(runId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    return response.ok;
  } catch (err: unknown) {
    loggerError(`Failed to delete history run ${runId}:`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clears all history runs from the backend ledger.
 */
export async function clearAllHistoryRuns(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/history`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    return response.ok;
  } catch (err: unknown) {
    loggerError("Failed to clear history runs:", err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function loggerError(msg: string, err: unknown) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(msg, err);
  }
}


