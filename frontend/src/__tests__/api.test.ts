import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapBackendToDetailedResult, APIClientError } from "../services/api";
import type { BackendAddressResult } from "../types";

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

  it("APIClientError carries HTTP status and network flags without altering verdict", () => {
    const netErr = new APIClientError("Failed to fetch", undefined, "NETWORK_ERROR", true);
    assert.equal(netErr.isNetworkError, true);
    assert.equal(netErr.code, "NETWORK_ERROR");
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
});
