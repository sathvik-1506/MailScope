/**
 * Centralized typed API client for the MailScope backend service.
 *
 * Configured via VITE_API_BASE_URL (or VITE_API_URL fallback).
 */

import type {
  AnalysisRequest,
  BackendAddressResult,
  DetailedAddressResult,
  CheckStatus,
  CheckItem,
  Verdict,
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

  // 5. Construct granular pipeline checks
  const checks: CheckItem[] = [
    {
      id: `chk-${idx}-1`,
      category: "syntax",
      name: "RFC 5321/5322 Syntax Format",
      status: syntaxStatus,
      detail:
        syntax_evidence?.reason ??
        (syntaxStatus === "passed"
          ? "Address format satisfies RFC specification."
          : syntaxStatus === "skipped"
          ? "Syntax validation skipped."
          : "Syntax validation failed or unavailable."),
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
        (smtpStatus === "skipped"
          ? "SMTP verification was not enabled for this request."
          : smtpStatus === "unavailable"
          ? "SMTP server unreachable or outbound port 25 blocked."
          : smtpStatus === "inconclusive"
          ? "SMTP evaluation inconclusive."
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
      `Cannot connect to MailScope API at ${API_BASE_URL} (${msg})`,
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
        smtp_enabled: payload.smtp_enabled ?? false,
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
      `Could not establish connection to MailScope backend service at ${API_BASE_URL}. Please ensure the backend is running. (${msg})`,
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
  return (data.results as BackendAddressResult[]).map((r, i) =>
    mapBackendToDetailedResult(r, i)
  );
}
