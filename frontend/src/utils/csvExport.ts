import type { DetailedAddressResult } from "../types";
import { BRAND } from "../constants/brand";

/**
 * Escapes a cell value for CSV output according to RFC 4180 while
 * actively mitigating Spreadsheet Formula Injection (CSV Injection / CWE-1236).
 *
 * If a value begins with '=', '+', '-', '@', '\t', or '\r', spreadsheet programs
 * (Excel, Calc, Google Sheets) may interpret the cell as an executable formula.
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

/**
 * Converts a list of DetailedAddressResult objects into a formatted CSV string.
 */
export function generateResultsCsv(results: DetailedAddressResult[]): string {
  const headers = [
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

  const headerLine = headers.map(escapeCsvField).join(",");

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
      r.evidence.join(" | "),
      r.limitations.join(" | "),
      r.isFixture ? "Test Fixture (RFC 2606)" : "Live Verification",
    ]
      .map(escapeCsvField)
      .join(",");
  });

  return [headerLine, ...rows].join("\r\n");
}

/**
 * Triggers a browser download of the generated CSV file.
 */
export function downloadResultsCsv(
  results: DetailedAddressResult[],
  filenamePrefix = BRAND.csvPrefix
): void {
  const csvContent = generateResultsCsv(results);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.csv`;

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
