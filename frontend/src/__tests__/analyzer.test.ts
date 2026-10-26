import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvField, generateResultsCsv } from "../utils/csvExport";
import { parseInputAddresses, FIXTURE_RESULTS } from "../services/analyzerAdapter";

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
  });

  it("prepends single quote to formula symbols preceded by leading spaces (bypass prevention)", () => {
    const escapedLeadingSpaces = escapeCsvField("   =cmd|' /C calc'!A0");
    assert.equal(escapedLeadingSpaces, `"'   =cmd|' /C calc'!A0"`);

    const escapedLeadingTabs = escapeCsvField("\t\t+12345");
    assert.equal(escapedLeadingTabs, `"'\t\t+12345"`);
  });

  it("prepends single quote to pipe characters", () => {
    const escapedPipe = escapeCsvField("|calc");
    assert.equal(escapedPipe, `"'|calc"`);
  });

  it("correctly escapes internal quotes with double quotes", () => {
    const escaped = escapeCsvField('Name with "Quotes"');
    assert.equal(escaped, '"Name with ""Quotes"""');
  });

  it("handles null and undefined values safely", () => {
    assert.equal(escapeCsvField(null), '""');
    assert.equal(escapeCsvField(undefined), '""');
  });
});

describe("CSV Generation", () => {
  it("generates proper CSV headers and rows for results", () => {
    const sample = FIXTURE_RESULTS.slice(0, 2);
    const csv = generateResultsCsv(sample);
    const lines = csv.split("\r\n");

    // Header line check
    assert.ok(lines[0].includes('"Email Address"'));
    assert.ok(lines[0].includes('"Verdict"'));
    assert.ok(lines[0].includes('"Primary Reason"'));

    // Record lines check
    assert.equal(lines.length, 3); // 1 header + 2 records
    assert.ok(lines[1].includes('"contact@example.com"'));
    assert.ok(lines[1].includes('"likely_delivered"'));
  });
});
