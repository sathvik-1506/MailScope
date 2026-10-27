import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvField, generateResultsCsv } from "../utils/csvExport";
import { filterResults } from "../utils/filterResults";
import { parseInputAddresses, FIXTURE_RESULTS } from "../services/analyzerAdapter";
import type { DetailedAddressResult } from "../types";

describe("Address Input Parsing", () => {
  it("ignores blank lines and whitespace", () => {
    const raw = `
      alice@example.com
      
      bob@example.com
      
      
      carol@example.org  
    `;
    const parsed = parseInputAddresses(raw);
    assert.deepEqual(parsed, [
      "alice@example.com",
      "bob@example.com",
      "carol@example.org",
    ]);
    assert.equal(parsed.length, 3);
  });

  it("handles commas and semicolons as delimiters", () => {
    const raw = "user1@example.com, user2@example.com; user3@example.org\nuser4@example.net";
    const parsed = parseInputAddresses(raw);
    assert.deepEqual(parsed, [
      "user1@example.com",
      "user2@example.com",
      "user3@example.org",
      "user4@example.net",
    ]);
  });

  it("handles duplicate inputs and empty raw input correctly", () => {
    const rawWithDups = "alice@example.com\nbob@example.com\nalice@example.com";
    const parsed = parseInputAddresses(rawWithDups);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0], "alice@example.com");
    assert.equal(parsed[2], "alice@example.com");

    const empty = parseInputAddresses("   \n\n  \t  ");
    assert.deepEqual(empty, []);
  });
});

describe("CSV Formula Injection Neutralization (CWE-1236)", () => {
  it("prepends single quote to values starting with '='", () => {
    const escaped = escapeCsvField("=SUM(A1:A10)");
    assert.equal(escaped, `"'=SUM(A1:A10)"`);
  });

  it("prepends single quote to values starting with '+'", () => {
    const escaped = escapeCsvField("+12345");
    assert.equal(escaped, ` "'+12345"`.trim());
  });

  it("prepends single quote to values starting with '-'", () => {
    const escaped = escapeCsvField("-10+5");
    assert.equal(escaped, `"'-10+5"`);
  });

  it("prepends single quote to values starting with '@'", () => {
    const escaped = escapeCsvField("@username");
    assert.equal(escaped, `"'@username"`);
  });

  it("prepends single quote to tab or carriage return characters", () => {
    const escapedTab = escapeCsvField("\tcalc");
    assert.equal(escapedTab, `"'\tcalc"`);

    const escapedCR = escapeCsvField("\rcalc");
    assert.equal(escapedCR, `"'\rcalc"`);

    const escapedLF = escapeCsvField("\ncalc");
    assert.equal(escapedLF, `"'\ncalc"`);
  });

  it("prepends single quote to formula symbols preceded by leading spaces (bypass prevention)", () => {
    const escapedLeadingSpaces = escapeCsvField("   =cmd|' /C calc'!A0");
    assert.equal(escapedLeadingSpaces, `"'   =cmd|' /C calc'!A0"`);

    const escapedLeadingTabs = escapeCsvField("\t\t+12345");
    assert.equal(escapedLeadingTabs, `"'\t\t+12345"`);
  });

  it("prepends single quote to formula symbols preceded by control characters (CWE-1236)", () => {
    const escapeNullByte = escapeCsvField("\x00=cmd");
    assert.equal(escapeNullByte, `"'\x00=cmd"`);

    const escapeEscapeChar = escapeCsvField("\x1b=1+2");
    assert.equal(escapeEscapeChar, `"'\x1b=1+2"`);
  });

  it("prepends single quote to pipe and percent characters", () => {
    const escapedPipe = escapeCsvField("|calc");
    assert.equal(escapedPipe, `"'|calc"`);

    const escapedPercent = escapeCsvField("%calc");
    assert.equal(escapedPercent, `"'%calc"`);
  });

  it("correctly escapes internal quotes with double quotes per RFC 4180", () => {
    const escaped = escapeCsvField('Name with "Quotes"');
    assert.equal(escaped, '"Name with ""Quotes"""');
  });

  it("preserves commas and line breaks within quoted fields", () => {
    const withCommas = escapeCsvField("one,two,three");
    assert.equal(withCommas, '"one,two,three"');

    const withNewlines = escapeCsvField("line1\r\nline2");
    assert.equal(withNewlines, '"line1\r\nline2"');
  });

  it("handles null and undefined values safely", () => {
    assert.equal(escapeCsvField(null), '""');
    assert.equal(escapeCsvField(undefined), '""');
  });
});

describe("CSV Generation", () => {
  it("generates proper CSV headers and rows for results without uncalibrated confidence", () => {
    const sample = FIXTURE_RESULTS.slice(0, 2);
    const csv = generateResultsCsv(sample);
    const lines = csv.split("\r\n");

    // Header line check
    assert.ok(lines[0].includes('"Email Address"'));
    assert.ok(lines[0].includes('"Verdict"'));
    assert.ok(lines[0].includes('"Reason Code"'));
    assert.ok(!lines[0].includes('"Confidence"'), "Confidence header must be absent from CSV");
    assert.ok(lines[0].includes('"Primary Reason"'));

    // Record lines check
    assert.equal(lines.length, 3); // 1 header + 2 records
    assert.ok(lines[1].includes('"contact@example.com"'));
    assert.ok(lines[1].includes('"likely_delivered"'));
    assert.ok(lines[1].includes('"MAILBOX_ACCEPTED"'));
    assert.ok(!lines[1].includes("%"), "Arbitrary confidence percentages must be absent from CSV rows");
  });

  it("handles empty result sets by generating only the header line", () => {
    const csv = generateResultsCsv([]);
    const lines = csv.split("\r\n");
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('"Email Address"'));
  });

  it("exports duplicate addresses accurately with consistent row counts", () => {
    const sample = FIXTURE_RESULTS.slice(0, 1);
    const duplicated: DetailedAddressResult[] = [
      { ...sample[0], id: "item-1" },
      { ...sample[0], id: "item-2" },
    ];
    const csv = generateResultsCsv(duplicated);
    const lines = csv.split("\r\n");
    assert.equal(lines.length, 3); // 1 header + 2 identical address rows
    assert.ok(lines[1].includes('"contact@example.com"'));
    assert.ok(lines[2].includes('"contact@example.com"'));
  });
});

describe("Filter and Search Consistency", () => {
  const mockResults: DetailedAddressResult[] = [
    {
      id: "1",
      address: "alice@corporate.com",
      normalizedAddress: "alice@corporate.com",
      verdict: "likely_delivered",
      reason: "Mailbox accepted probe.",
      reasonCode: "MAILBOX_ACCEPTED",
      syntaxStatus: "passed",
      dnsStatus: "passed",
      routingStatus: "passed",
      smtpStatus: "passed",
      checks: [],
      evidence: ["DNS: MX corporate-mail.com", "SMTP: 250 OK"],
      limitations: [],
    },
    {
      id: "2",
      address: "bad-syntax@@invalid",
      normalizedAddress: null,
      verdict: "likely_bounce",
      reason: "Syntax violation in domain.",
      reasonCode: "INVALID_SYNTAX",
      syntaxStatus: "failed",
      dnsStatus: "skipped",
      routingStatus: "skipped",
      smtpStatus: "skipped",
      checks: [],
      evidence: ["Syntax failed"],
      limitations: [],
    },
    {
      id: "3",
      address: "timeout@slow-server.org",
      normalizedAddress: "timeout@slow-server.org",
      verdict: "unknown",
      reason: "DNS resolution timed out.",
      reasonCode: "DNS_TIMEOUT",
      syntaxStatus: "passed",
      dnsStatus: "inconclusive",
      routingStatus: "inconclusive",
      smtpStatus: "skipped",
      checks: [],
      evidence: ["DNS timeout after 5s"],
      limitations: [],
    },
  ];

  it("filters accurately by verdict tabs", () => {
    const all = filterResults(mockResults, "all", "");
    assert.equal(all.length, 3);

    const delivered = filterResults(mockResults, "likely_delivered", "");
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].address, "alice@corporate.com");

    const bounce = filterResults(mockResults, "likely_bounce", "");
    assert.equal(bounce.length, 1);
    assert.equal(bounce[0].address, "bad-syntax@@invalid");

    const unknown = filterResults(mockResults, "unknown", "");
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].address, "timeout@slow-server.org");
  });

  it("searches across address, domain, reason, reason code, and evidence", () => {
    // Search by address
    assert.equal(filterResults(mockResults, "all", "alice").length, 1);

    // Search by domain
    assert.equal(filterResults(mockResults, "all", "corporate.com").length, 1);

    // Search by reason keyword
    assert.equal(filterResults(mockResults, "all", "timed out").length, 1);

    // Search by reason code
    assert.equal(filterResults(mockResults, "all", "INVALID_SYNTAX").length, 1);

    // Search by evidence keyword
    assert.equal(filterResults(mockResults, "all", "corporate-mail.com").length, 1);

    // Search with no matches
    assert.equal(filterResults(mockResults, "all", "nonexistent-keyword").length, 0);
  });

  it("combines verdict filter with search query consistently", () => {
    // Matches verdict unknown AND query "timeout"
    const matched = filterResults(mockResults, "unknown", "timeout");
    assert.equal(matched.length, 1);

    // Matches query "timeout" but filtered to likely_bounce -> 0
    const filteredOut = filterResults(mockResults, "likely_bounce", "timeout");
    assert.equal(filteredOut.length, 0);
  });
});
