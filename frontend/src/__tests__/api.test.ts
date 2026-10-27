import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapBackendToDetailedResult, APIClientError } from "../services/api";
import type { BackendAddressResult } from "../types";
import { VERDICT_META } from "../types";

describe("Frontend API Client Mapping", () => {
  it("maps a successful backend response into DetailedAddressResult with checks", () => {
    const backendResult: BackendAddressResult = {
      address: "alice@example.com",
      original_input: "alice@example.com",
      normalized_address: "alice@example.com",
      verdict: "likely_delivered",
      reason_code: "MAILBOX_ACCEPTED",
      explanation: "Target mail server accepted recipient probe: 250 OK",
      syntax_evidence: {
        valid: true,
        normalized: "alice@example.com",
        reason: "Address passes RFC 5321/5322 syntax checks.",
      },
      dns_evidence: {
        status: "has_mx",
        domain: "example.com",
        mx_hosts: ["mail.example.com"],
        has_implicit_mx: false,
        reason: "Found 1 MX record(s): mail.example.com",
      },
      smtp_evidence: {
        status: "accepted",
        smtp_code: 250,
        reason: "Server responded 250: 2.1.5 Recipient OK",
      },
      checks_run: ["syntax", "dns", "smtp"],
      checks_skipped: [],
      evidence: [
        "Address passes RFC 5321/5322 syntax checks.",
        "DNS: Found 1 MX record(s): mail.example.com",
        "SMTP: Server responded 250",
      ],
      limitations: ["SMTP acceptance does not guarantee delivery; catch-all servers accept all addresses."],
    };

    const detailed = mapBackendToDetailedResult(backendResult, 0);

    assert.equal(detailed.address, "alice@example.com");
    assert.equal(detailed.verdict, "likely_delivered");
    assert.equal(detailed.reasonCode, "MAILBOX_ACCEPTED");
    assert.equal(detailed.syntaxStatus, "passed");
    assert.equal(detailed.dnsStatus, "passed");
    assert.equal(detailed.routingStatus, "passed");
    assert.equal(detailed.smtpStatus, "passed");
    assert.equal(detailed.checks.length, 4);
    assert.equal(detailed.isFixture, false);
    assert.equal("confidence" in detailed, false);
  });

  it("maps each verdict correctly and aligns with VERDICT_META labels and colors", () => {
    const verdicts: ("likely_delivered" | "likely_bounce" | "unknown")[] = [
      "likely_delivered",
      "likely_bounce",
      "unknown",
    ];

    for (const v of verdicts) {
      const res = mapBackendToDetailedResult(
        {
          address: `test-${v}@example.com`,
          verdict: v,
          reason_code: "TEST_REASON",
          explanation: `Testing verdict ${v}`,
          evidence: [],
          limitations: [],
        },
        0
      );

      assert.equal(res.verdict, v);
      assert.ok(VERDICT_META[res.verdict]);
      assert.ok(VERDICT_META[res.verdict].label);
      assert.ok(VERDICT_META[res.verdict].badgeColor);
      assert.ok(VERDICT_META[res.verdict].colorClass);
    }
  });

  it("identifies skipped SMTP check when SMTP probing was disabled", () => {
    const backendResult: BackendAddressResult = {
      address: "bob@example.com",
      verdict: "unknown",
      reason_code: "MAILBOX_UNCONFIRMED",
      explanation: "Domain exists but mailbox unconfirmed.",
      syntax_evidence: { valid: true, reason: "OK" },
      dns_evidence: { status: "has_mx", domain: "example.com", mx_hosts: ["mail.example.com"], reason: "MX found" },
      smtp_evidence: { status: "disabled", reason: "SMTP verification disabled." },
      checks_run: ["syntax", "dns"],
      checks_skipped: ["smtp"],
      evidence: ["Syntax valid", "DNS MX found"],
      limitations: ["Mailbox unconfirmed without SMTP probing."],
    };

    const detailed = mapBackendToDetailedResult(backendResult, 1);
    assert.equal(detailed.smtpStatus, "skipped");
    assert.equal(detailed.verdict, "unknown");
  });

  it("safely handles missing optional evidence objects without throwing", () => {
    const minimalResult: BackendAddressResult = {
      address: "sparse@example.com",
      verdict: "unknown",
      reason_code: "UNKNOWN",
      explanation: "Sparse response with missing evidence blocks.",
      evidence: [],
      limitations: [],
      // syntax_evidence, dns_evidence, smtp_evidence intentionally omitted
    };

    const detailed = mapBackendToDetailedResult(minimalResult, 0);
    assert.equal(detailed.address, "sparse@example.com");
    assert.equal(detailed.verdict, "unknown");
    assert.equal(detailed.syntaxStatus, "unavailable");
    assert.equal(detailed.dnsStatus, "unavailable");
    assert.equal(detailed.routingStatus, "unavailable");
    assert.equal(detailed.smtpStatus, "unavailable");
    assert.equal(detailed.checks.length, 4);
  });

  it("safely handles unexpected response fields and malformed records", () => {
    // Corrupted record with unexpected verdict string and non-array evidence
    const corruptedRecord = {
      address: "corrupt@example.com",
      verdict: "INVALID_UNKNOWN_VERDICT",
      evidence: "not-an-array",
      limitations: null,
      extra_unknown_field: 12345,
    } as unknown as BackendAddressResult;

    const detailed = mapBackendToDetailedResult(corruptedRecord, 0);
    assert.equal(detailed.address, "corrupt@example.com");
    assert.equal(detailed.verdict, "unknown"); // Safely fell back to unknown
    assert.deepEqual(detailed.evidence, []);
    assert.deepEqual(detailed.limitations, []);

    // Completely null record
    const nullDetailed = mapBackendToDetailedResult(null as unknown as BackendAddressResult, 5);
    assert.equal(nullDetailed.verdict, "unknown");
    assert.equal(nullDetailed.reasonCode, "MALFORMED_RECORD");
  });

  it("APIClientError carries HTTP status and network flags without altering verdict", () => {
    const netErr = new APIClientError("Failed to fetch", undefined, "NETWORK_ERROR", true);
    assert.equal(netErr.isNetworkError, true);
    assert.equal(netErr.code, "NETWORK_ERROR");

    const httpErr = new APIClientError("Payload too large", 413, "BATCH_SIZE_EXCEEDED", false);
    assert.equal(httpErr.isNetworkError, false);
    assert.equal(httpErr.status, 413);
    assert.equal(httpErr.code, "BATCH_SIZE_EXCEEDED");
  });

  it("safely maps temporary DNS errors (timeout/servfail) to unknown verdict, never bounce", () => {
    const backendResult: BackendAddressResult = {
      address: "temp-error@example.com",
      verdict: "unknown",
      reason_code: "DNS_TEMPORARY_FAILURE",
      explanation: "DNS query timed out (inconclusive).",
      syntax_evidence: { valid: true, reason: "OK" },
      dns_evidence: { status: "timeout", domain: "example.com", reason: "DNS query timed out" },
      checks_run: ["syntax", "dns"],
      checks_skipped: ["smtp"],
      evidence: ["DNS resolution timed out"],
      limitations: ["Temporary DNS resolution errors prevent authoritative routing analysis."],
    };

    const detailed = mapBackendToDetailedResult(backendResult, 2);
    assert.equal(detailed.verdict, "unknown");
    assert.equal(detailed.dnsStatus, "inconclusive");
    assert.equal(detailed.routingStatus, "inconclusive");
    assert.notEqual(detailed.verdict, "likely_bounce");
  });

  it("safely maps blocked SMTP connection / unavailable port 25 to unavailable check, not bounce", () => {
    const backendResult: BackendAddressResult = {
      address: "blocked-port25@example.com",
      verdict: "unknown",
      reason_code: "SMTP_UNAVAILABLE",
      explanation: "Outbound port 25 appears blocked by ISP/firewall.",
      syntax_evidence: { valid: true, reason: "OK" },
      dns_evidence: { status: "has_mx", domain: "example.com", mx_hosts: ["mail.example.com"], reason: "MX found" },
      smtp_evidence: { status: "inconclusive", reason: "Connection refused on port 25" },
      checks_run: ["syntax", "dns", "smtp"],
      checks_skipped: [],
      evidence: ["MX located", "SMTP connection refused or blocked"],
      limitations: ["SMTP handshake could not complete."],
    };

    const detailed = mapBackendToDetailedResult(backendResult, 3);
    assert.equal(detailed.verdict, "unknown");
    assert.equal(detailed.smtpStatus, "unavailable");
    assert.notEqual(detailed.verdict, "likely_bounce");
  });

  it("generates unique row IDs for duplicate addresses in the same batch", () => {
    const backendItem: BackendAddressResult = {
      address: "dup@example.com",
      verdict: "unknown",
      reason_code: "MAILBOX_UNCONFIRMED",
      explanation: "Duplicate input item.",
      evidence: [],
      limitations: [],
    };

    const item1 = mapBackendToDetailedResult(backendItem, 0);
    const item2 = mapBackendToDetailedResult(backendItem, 1);

    assert.equal(item1.address, item2.address);
    assert.notEqual(item1.id, item2.id, "Duplicate addresses must receive distinct IDs for table row rendering");
  });

  it("maps separate statuses for Syntax, DNS/MX, SMTP probe, and Mailbox existence", () => {
    // Scenario: Syntax valid, MX configured, but Render port 25 blocked
    const renderBlockedResult: BackendAddressResult = {
      address: "test@company.com",
      verdict: "unknown",
      reason_code: "SMTP_UNAVAILABLE",
      explanation: "SMTP probe is unavailable from the current hosting environment (port 25 blocked).",
      syntax_validation: "VALID",
      dns_mx_validation: "CONFIGURED",
      smtp_probe: "UNAVAILABLE",
      mailbox_existence: "UNCONFIRMED",
      syntax_evidence: { valid: true, reason: "RFC syntax format valid." },
      dns_evidence: {
        status: "has_mx",
        domain: "company.com",
        mx_hosts: ["mail.company.com"],
        reason: "Authoritative MX record found.",
      },
      smtp_evidence: {
        status: "unavailable",
        reason: "Connection to 93.184.216.34:25 failed: [Errno 101] Network is unreachable",
      },
      evidence: ["Syntax valid", "MX active", "SMTP port 25 blocked"],
      limitations: ["SMTP port 25 blocked by hosting environment."],
    };

    const detailed = mapBackendToDetailedResult(renderBlockedResult, 0);

    // Verify 4 independent check dimensions
    assert.equal(detailed.syntaxValidation, "VALID");
    assert.equal(detailed.dnsMxValidation, "CONFIGURED");
    assert.equal(detailed.smtpProbe, "UNAVAILABLE");
    assert.equal(detailed.mailboxExistence, "UNCONFIRMED");
    assert.equal(detailed.verdict, "unknown");

    // Specifically verify SMTP network failure never causes invalid syntax or bounce verdict
    assert.notEqual(detailed.verdict, "likely_bounce");
    assert.notEqual(detailed.syntaxValidation, "INVALID");
    assert.equal(detailed.syntaxStatus, "passed");
    assert.equal(detailed.smtpStatus, "unavailable");
  });
});
