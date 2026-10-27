import type { DetailedAddressResult } from "../types";

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

  // Neutralize spreadsheet formula injection characters (including leading whitespace / tab / carriage return / pipe / percent)
  if (/^\s*[=+\-@\t\r|%]/.test(str)) {
    str = "'" + str;
  }

  // Escape embedded double quotes by doubling them
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
  filenamePrefix = "mailscope_analysis"
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
