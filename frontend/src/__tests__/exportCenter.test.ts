import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  escapeCsvField,
  generateResultsCsv,
  downloadResultsCsv,
  CSV_COLUMN_OPTIONS,
} from "../utils/csvExport";
import type { DetailedAddressResult } from "../types";

const MOCK_RESULTS: DetailedAddressResult[] = [
  {
    id: "rec-1",
    address: "alice@example.com",
    originalInput: "alice@example.com",
    normalizedAddress: "alice@example.com",
    verdict: "likely_delivered",
    reason: "Recipient mailbox verified and accepted.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    checks: [
      {
        id: "syntax-1",
        name: "RFC Syntax",
        category: "syntax",
        status: "passed",
        detail: "Passed RFC 5321/5322 grammar checks.",
      },
      {
        id: "dns-1",
        name: "DNS MX Resolution",
        category: "dns",
        status: "passed",
        detail: "Found active MX records: mail.example.com.",
      },
    ],
    evidence: ["Passed syntax validation.", "Found active MX records."],
    limitations: ["SMTP acceptance does not guarantee inbox delivery on catch-all domains."],
    isFixture: false,
    analysedAt: "2026-10-27T12:00:00.000Z",
  },
  {
    id: "rec-2",
    address: "bob@invalid-domain.xyz",
    originalInput: "bob@invalid-domain.xyz",
    normalizedAddress: "bob@invalid-domain.xyz",
    verdict: "likely_bounce",
    reason: "Domain does not exist (NXDOMAIN).",
    reasonCode: "DOMAIN_NOT_FOUND",
    syntaxStatus: "passed",
    dnsStatus: "failed",
    routingStatus: "failed",
    smtpStatus: "skipped",
    checks: [
      {
        id: "syntax-2",
        name: "RFC Syntax",
        category: "syntax",
        status: "passed",
        detail: "Passed RFC syntax.",
      },
      {
        id: "dns-2",
        name: "DNS MX Resolution",
        category: "dns",
        status: "failed",
        detail: "NXDOMAIN: Domain has no authoritative DNS records.",
      },
    ],
    evidence: ["NXDOMAIN encountered."],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T12:00:00.000Z",
  },
];

describe("Export Center & CSV Generation Engine", () => {
  // 1. Successful Export
  it("generates a complete CSV report with header and records", () => {
    const csv = generateResultsCsv(MOCK_RESULTS);
    const lines = csv.split("\r\n");

    assert.equal(lines.length, 3); // 1 header line + 2 data rows
    assert.ok(lines[0].includes('"Email Address"'));
    assert.ok(lines[0].includes('"Verdict"'));
    assert.ok(lines[1].includes('"alice@example.com"'));
    assert.ok(lines[1].includes('"likely_delivered"'));
    assert.ok(lines[2].includes('"bob@invalid-domain.xyz"'));
    assert.ok(lines[2].includes('"likely_bounce"'));
  });

  // 2. Empty Results
  it("generateResultsCsv handles empty result sets by outputting only the header line", () => {
    const csv = generateResultsCsv([]);
    const lines = csv.split("\r\n");
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('"Email Address"'));
  });

  it("downloadResultsCsv throws an explicit error when given an empty results array", () => {
    assert.throws(
      () => {
        downloadResultsCsv([]);
      },
      {
        name: "Error",
        message: "No analysis records available to export.",
      }
    );
  });

  // 3. Column Selection
  it("exports only selected columns when column IDs are provided", () => {
    const selectedColumns = ["address", "verdict", "reason_code"];
    const csv = generateResultsCsv(MOCK_RESULTS, selectedColumns);
    const lines = csv.split("\r\n");

    assert.equal(lines[0], '"Email Address","Verdict","Reason Code"');
    assert.equal(lines[1], '"alice@example.com","likely_delivered","MAILBOX_ACCEPTED"');
    assert.equal(lines[2], '"bob@invalid-domain.xyz","likely_bounce","DOMAIN_NOT_FOUND"');
  });

  it("exports human-readable explanation and syntax/DNS evidence when requested", () => {
    const selectedColumns = ["address", "explanation", "syntax_evidence", "dns_evidence", "smtp_status"];
    const csv = generateResultsCsv(MOCK_RESULTS, selectedColumns);
    const lines = csv.split("\r\n");

    assert.ok(lines[0].includes('"Human-Readable Explanation"'));
    assert.ok(lines[0].includes('"Syntax Evidence"'));
    assert.ok(lines[0].includes('"DNS & Routing Evidence"'));
    assert.ok(lines[0].includes('"SMTP Status"'));

    // Check row 1 evidence values
    assert.ok(lines[1].includes("Recipient mailbox verified and accepted."));
    assert.ok(lines[1].includes("Passed RFC 5321/5322 grammar checks."));
    assert.ok(lines[1].includes("Found active MX records: mail.example.com."));
    assert.ok(lines[1].includes('"passed"'));
  });

  // 4. Unicode & BOM Preservation
  it("preserves international Unicode characters in email addresses, domains, and explanations", () => {
    const unicodeRecord: DetailedAddressResult = {
      id: "unicode-1",
      address: "münchen.user@österreich.at",
      originalInput: "münchen.user@österreich.at",
      verdict: "likely_delivered",
      reason: "Gültiges Postfach mit Umlauten: ä, ö, ü, ß.",
      syntaxStatus: "passed",
      dnsStatus: "passed",
      routingStatus: "passed",
      smtpStatus: "passed",
      checks: [],
      evidence: ["日本語テスト: 配信可能", "Привет мир: проверка прошла успешно"],
      limitations: [],
      isFixture: false,
      analysedAt: "2026-10-27T12:00:00.000Z",
    };

    const csv = generateResultsCsv([unicodeRecord]);
    assert.ok(csv.includes("münchen.user@österreich.at"));
    assert.ok(csv.includes("Gültiges Postfach mit Umlauten: ä, ö, ü, ß."));
    assert.ok(csv.includes("日本語テスト: 配信可能"));
    assert.ok(csv.includes("Привет мир: проверка прошла успешно"));
  });

  // 5. RFC 4180 Quoting & Escaping
  it("escapes internal quotes by doubling them per RFC 4180", () => {
    const quotedRecord: DetailedAddressResult = {
      ...MOCK_RESULTS[0],
      reason: 'Server responded with "250 OK" message',
    };

    const csv = generateResultsCsv([quotedRecord], ["address", "explanation"]);
    const lines = csv.split("\r\n");
    assert.equal(lines[1], '"alice@example.com","Server responded with ""250 OK"" message"');
  });

  // 6. Embedded Line Breaks
  it("preserves embedded carriage returns and line feeds inside quoted cells", () => {
    const multilineRecord: DetailedAddressResult = {
      ...MOCK_RESULTS[0],
      reason: "Step 1: Syntax pass\r\nStep 2: DNS pass\r\nStep 3: Mailbox accepted",
    };

    const csv = generateResultsCsv([multilineRecord], ["address", "explanation"]);
    assert.ok(csv.includes('"Step 1: Syntax pass\r\nStep 2: DNS pass\r\nStep 3: Mailbox accepted"'));
  });

  // 7. Formula Injection Mitigation (CWE-1236)
  it("mitigates spreadsheet formula injection across all formula trigger characters", () => {
    const dangerousRecord: DetailedAddressResult = {
      id: "danger-1",
      address: "=cmd|' /C calc'!A0@example.com",
      originalInput: "=cmd|' /C calc'!A0@example.com",
      verdict: "likely_bounce",
      reason: "+2+5+cmd|' /C calc'!A0",
      reasonCode: "-ERR_INJECT",
      syntaxStatus: "failed",
      dnsStatus: "unavailable",
      routingStatus: "unavailable",
      smtpStatus: "skipped",
      checks: [],
      evidence: ["@SUM(A1:A10)"],
      limitations: ["\t\t=HYPERLINK(\"http://evil.com\")"],
      isFixture: false,
      analysedAt: "2026-10-27T12:00:00.000Z",
    };

    const csv = generateResultsCsv([dangerousRecord]);

    // Ensure all dangerous values begin with apostrophe inside quotes
    assert.ok(csv.includes("\"'=cmd|' /C calc'!A0@example.com\""));
    assert.ok(csv.includes("\"'+2+5+cmd|' /C calc'!A0\""));
    assert.ok(csv.includes("\"'-ERR_INJECT\""));
    assert.ok(csv.includes("\"'@SUM(A1:A10)\""));
    assert.ok(csv.includes("\"'\t\t=HYPERLINK(\"\"http://evil.com\"\")\""));

    // Also test pipe and percent triggers individually via escapeCsvField
    assert.equal(escapeCsvField("|PIPE_INJECT"), `"\'|PIPE_INJECT"`);
    assert.equal(escapeCsvField("%calc%"), `"\'%calc%"`);
  });

  // 8. Missing History Records & Unavailable Datasets
  it("verifies column options metadata exists for all recommended export fields", () => {
    const ids = CSV_COLUMN_OPTIONS.map((c) => c.id);
    assert.ok(ids.includes("address"));
    assert.ok(ids.includes("verdict"));
    assert.ok(ids.includes("reason_code"));
    assert.ok(ids.includes("explanation"));
    assert.ok(ids.includes("syntax_evidence"));
    assert.ok(ids.includes("dns_evidence"));
    assert.ok(ids.includes("smtp_status"));
    assert.ok(ids.includes("analysed_at"));
  });

  // 9. Download Execution & DOM Integration
  describe("Download Action & DOM Execution", () => {
    let clickedLink: { href?: string; download?: string; clicked: boolean } = { clicked: false };
    let capturedBlobContent: string = "";

    beforeEach(() => {
      clickedLink = { clicked: false };
      capturedBlobContent = "";

      // Mock Blob
      globalThis.Blob = class MockBlob {
        content: string[];
        constructor(parts: any[]) {
          this.content = parts;
          capturedBlobContent = parts.join("");
        }
      } as any;

      // Mock document and URL
      globalThis.document = {
        createElement: () => ({
          setAttribute: (name: string, val: string) => {
            if (name === "href") clickedLink.href = val;
            if (name === "download") clickedLink.download = val;
          },
          style: {},
          click: () => {
            clickedLink.clicked = true;
          },
        }),
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      } as unknown as Document;

      globalThis.URL = {
        createObjectURL: () => "blob:mailora-export-12345",
        revokeObjectURL: () => {},
      } as unknown as typeof URL;
    });

    it("triggers browser download with UTF-8 BOM, custom prefix, and current date", () => {
      const filename = downloadResultsCsv(MOCK_RESULTS, "custom_report", ["address", "verdict"]);

      assert.ok(filename.startsWith("custom_report_"));
      assert.ok(filename.endsWith(".csv"));
      assert.equal(clickedLink.clicked, true);
      assert.equal(clickedLink.download, filename);
      assert.equal(clickedLink.href, "blob:mailora-export-12345");

      // Verify that the UTF-8 Byte Order Mark (\uFEFF) is prepended to the blob
      assert.ok(capturedBlobContent.startsWith("\uFEFF"));
      assert.ok(capturedBlobContent.includes('"Email Address","Verdict"'));
    });
  });
});
