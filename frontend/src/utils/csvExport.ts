import type { DetailedAddressResult } from "../types";
import { BRAND } from "../constants/brand";

/**
 * Escapes a cell value for CSV output according to RFC 4180 while
 * actively mitigating Spreadsheet Formula Injection (CSV Injection / CWE-1236).
 *
 * If a value begins with '=', '+', '-', '@', '|', '%', '\t', or '\r', spreadsheet
 * applications (Excel, Calc, Google Sheets) may interpret the cell as an executable formula.
 * Prepending an apostrophe (') neutralizes formula execution.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // Neutralize spreadsheet formula injection characters (CWE-1236 / CSV Injection).
  // Safely handles values beginning with '=', '+', '-', '@', '|', '%',
  // including cases where formula evaluation could be triggered after leading
  // whitespace, control characters (0x00 - 0x1F), tabs, or carriage returns.
  let isFormula = false;
  let i = 0;
  while (i < str.length && str.charCodeAt(i) <= 32) {
    i++;
  }
  if (i < str.length) {
    const ch = str.charAt(i);
    if (ch === "=" || ch === "+" || ch === "-" || ch === "@" || ch === "|" || ch === "%") {
      isFormula = true;
    }
  }
  if (!isFormula && str.length > 0) {
    const firstCode = str.charCodeAt(0);
    if (firstCode === 9 || firstCode === 10 || firstCode === 13) {
      isFormula = true;
    }
  }

  if (isFormula) {
    str = "'" + str;
  }

  // Escape embedded double quotes by doubling them per RFC 4180
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export interface CsvColumnOption {
  id: string;
  header: string;
  label: string;
  description: string;
  defaultSelected: boolean;
  getValue: (r: DetailedAddressResult) => unknown;
}

export const CSV_COLUMN_OPTIONS: CsvColumnOption[] = [
  {
    id: "address",
    header: "Email Address",
    label: "Email Address",
    description: "Evaluated recipient email address",
    defaultSelected: true,
    getValue: (r) => r.address,
  },
  {
    id: "verdict",
    header: "Verdict",
    label: "Verdict Classification",
    description: "Deliverability verdict (likely_delivered, likely_bounce, or unknown)",
    defaultSelected: true,
    getValue: (r) => r.verdict,
  },
  {
    id: "reason_code",
    header: "Reason Code",
    label: "Reason Code",
    description: "Machine-readable classification signal code",
    defaultSelected: true,
    getValue: (r) => r.reasonCode || "",
  },
  {
    id: "explanation",
    header: "Human-Readable Explanation",
    label: "Human-Readable Explanation",
    description: "Plain-language summary of delivery signals",
    defaultSelected: true,
    getValue: (r) => r.reason,
  },
  {
    id: "syntax_evidence",
    header: "Syntax Evidence",
    label: "Syntax Evidence",
    description: "RFC 5321/5322 grammar and length limits evaluation",
    defaultSelected: true,
    getValue: (r) => {
      const check = r.checks?.find((c) => c.category === "syntax");
      return check?.detail || `Syntax: ${r.syntaxStatus}`;
    },
  },
  {
    id: "dns_evidence",
    header: "DNS & Routing Evidence",
    label: "DNS & Routing Evidence",
    description: "Authoritative MX, A/AAAA records, and null MX checks",
    defaultSelected: true,
    getValue: (r) => {
      const dnsChecks = r.checks?.filter((c) => c.category === "dns" || c.category === "routing");
      if (dnsChecks && dnsChecks.length > 0) {
        return dnsChecks.map((c) => c.detail).join(" | ");
      }
      return `DNS: ${r.dnsStatus}; Routing: ${r.routingStatus}`;
    },
  },
  {
    id: "smtp_status",
    header: "SMTP Status",
    label: "SMTP Probe Status",
    description: "Direct recipient handshake status (accepted, rejected, inconclusive, disabled)",
    defaultSelected: true,
    getValue: (r) => r.smtpStatus,
  },
  {
    id: "analysed_at",
    header: "Analysis Timestamp",
    label: "Analysis Timestamp",
    description: "UTC ISO timestamp when verification was executed",
    defaultSelected: true,
    getValue: (r) => r.analysedAt || new Date().toISOString(),
  },
  {
    id: "evidence",
    header: "Evidence Ledger Summary",
    label: "Evidence Ledger Summary",
    description: "Granular technical signals and inspection notes",
    defaultSelected: false,
    getValue: (r) => (r.evidence ? r.evidence.join(" | ") : ""),
  },
  {
    id: "limitations",
    header: "Operational Limitations",
    label: "Caveats & Limitations",
    description: "Known operational limits (greylisting, catch-all, port 25 constraints)",
    defaultSelected: false,
    getValue: (r) => (r.limitations ? r.limitations.join(" | ") : ""),
  },
  {
    id: "data_type",
    header: "Data Type",
    label: "Data Source Classification",
    description: "Distinguishes live verification results from test fixtures",
    defaultSelected: false,
    getValue: (r) => (r.isFixture ? "Test Fixture (RFC 2606)" : "Live Verification"),
  },
];

/**
 * Converts a list of DetailedAddressResult objects into a formatted CSV string.
 *
 * @param results - Array of DetailedAddressResult records
 * @param selectedColumnIds - Optional list of column IDs to export. If omitted or empty,
 *                            exports standard comprehensive report columns.
 */
export function generateResultsCsv(
  results: DetailedAddressResult[],
  selectedColumnIds?: string[]
): string {
  // If specific column IDs were supplied, filter CSV_COLUMN_OPTIONS accordingly
  if (selectedColumnIds && selectedColumnIds.length > 0) {
    const selectedCols = CSV_COLUMN_OPTIONS.filter((col) =>
      selectedColumnIds.includes(col.id)
    );

    if (selectedCols.length > 0) {
      const headerLine = selectedCols.map((col) => escapeCsvField(col.header)).join(",");
      const rows = results.map((r) =>
        selectedCols.map((col) => escapeCsvField(col.getValue(r))).join(",")
      );
      return [headerLine, ...rows].join("\r\n");
    }
  }

  // Default backward-compatible comprehensive report schema
  const defaultHeaders = [
    "Email Address",
    "Verdict",
    "Reason Code",
    "Syntax Status",
    "DNS Status",
    "Routing Status",
    "SMTP Status",
    "Primary Reason",
    "Evidence",
    "Limitations",
    "Data Type",
  ];

  const headerLine = defaultHeaders.map(escapeCsvField).join(",");

  const rows = results.map((r) => {
    return [
      r.address,
      r.verdict,
      r.reasonCode || "",
      r.syntaxStatus,
      r.dnsStatus,
      r.routingStatus,
      r.smtpStatus,
      r.reason,
      r.evidence ? r.evidence.join(" | ") : "",
      r.limitations ? r.limitations.join(" | ") : "",
      r.isFixture ? "Test Fixture (RFC 2606)" : "Live Verification",
    ]
      .map(escapeCsvField)
      .join(",");
  });

  return [headerLine, ...rows].join("\r\n");
}

/**
 * Triggers a browser download of the generated CSV file.
 * Automatically prepends the UTF-8 Byte Order Mark (\uFEFF) to guarantee
 * proper table parsing and Unicode preservation across Microsoft Excel, Google Sheets,
 * and LibreOffice Calc.
 *
 * @param results - Array of DetailedAddressResult records to export
 * @param filenamePrefix - Prefix for the generated file
 * @param selectedColumnIds - Optional specific column IDs to export
 * @returns Generated filename
 */
export function downloadResultsCsv(
  results: DetailedAddressResult[],
  filenamePrefix: string = BRAND.csvPrefix,
  selectedColumnIds?: string[]
): string {
  if (!results || results.length === 0) {
    throw new Error("No analysis records available to export.");
  }

  const csvContent = generateResultsCsv(results, selectedColumnIds);
  // Prepend UTF-8 BOM (\uFEFF) to guarantee Excel & spreadsheet programs open Unicode correctly
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.csv`;

  if (typeof document !== "undefined" && document.createElement) {
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return filename;
}
