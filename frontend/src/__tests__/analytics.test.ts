import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferEmailProvider,
  calculateProviderDistribution,
  calculateDomainDistribution,
  calculateDnsRoutingStats,
  calculateSmtpCoverageStats,
  calculateDataQualityStats,
} from "../utils/analyticsTelemetry";
import type { DetailedAddressResult } from "../types";

const MOCK_ANALYTICS_RECORDS: DetailedAddressResult[] = [
  {
    id: "r1",
    address: "alice@gmail.com",
    originalInput: "alice@gmail.com",
    verdict: "likely_delivered",
    reason: "Recipient mailbox accepted.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    checks: [
      { id: "c1", name: "Syntax", category: "syntax", status: "passed", detail: "Valid syntax." },
      { id: "c2", name: "DNS", category: "dns", status: "passed", detail: "MX: gmail-smtp-in.l.google.com" },
    ],
    evidence: ["MX: gmail-smtp-in.l.google.com", "SMTP: 250 Recipient OK"],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "r2",
    address: "ALICE@gmail.com", // Duplicate of r1
    originalInput: "ALICE@gmail.com",
    verdict: "likely_delivered",
    reason: "Recipient mailbox accepted.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    checks: [],
    evidence: [],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:05:00.000Z",
  },
  {
    id: "r3",
    address: "bob@company.org", // Custom domain with Outlook MX evidence
    originalInput: "bob@company.org",
    verdict: "likely_delivered",
    reason: "Corporate Microsoft 365 server accepted.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    checks: [],
    evidence: ["MX: company-org.mail.protection.outlook.com"],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:10:00.000Z",
  },
  {
    id: "r4",
    address: "charlie@customcorp.io", // Custom domain with unknown provider
    originalInput: "charlie@customcorp.io",
    verdict: "unknown",
    reason: "SMTP connection timed out on port 25.",
    reasonCode: "CONNECTION_TIMEOUT",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "inconclusive",
    checks: [],
    evidence: ["MX: mail.customcorp.io"],
    limitations: ["SMTP timed out"],
    isFixture: false,
    analysedAt: "2026-10-27T10:15:00.000Z",
  },
  {
    id: "r5",
    address: "david@nonexistent-domain.xyz",
    originalInput: "david@nonexistent-domain.xyz",
    verdict: "likely_bounce",
    reason: "Domain does not exist (NXDOMAIN).",
    reasonCode: "DOMAIN_NOT_FOUND",
    syntaxStatus: "passed",
    dnsStatus: "failed",
    routingStatus: "failed",
    smtpStatus: "skipped",
    checks: [],
    evidence: ["NXDOMAIN"],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:20:00.000Z",
  },
  {
    id: "r6",
    address: "eve@null-mx-domain.net",
    originalInput: "eve@null-mx-domain.net",
    verdict: "likely_bounce",
    reason: "Domain publishes Null MX record (RFC 7505).",
    reasonCode: "NULL_MX_REJECTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "failed",
    smtpStatus: "skipped",
    checks: [],
    evidence: ["Null MX: . 0"],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:25:00.000Z",
  },
  {
    id: "r7",
    address: "invalid..syntax@domain.com",
    originalInput: "invalid..syntax@domain.com",
    verdict: "likely_bounce",
    reason: "Consecutive dots violate RFC 5321/5322.",
    reasonCode: "INVALID_SYNTAX",
    syntaxStatus: "failed",
    dnsStatus: "unavailable",
    routingStatus: "unavailable",
    smtpStatus: "skipped",
    checks: [],
    evidence: ["Consecutive dots in local-part"],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T10:30:00.000Z",
  },
  {
    id: "r8",
    address: "sample@example.com", // RFC 2606 test fixture
    originalInput: "sample@example.com",
    verdict: "likely_delivered",
    reason: "Test fixture verification.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "unavailable", // Port 25 blocked
    checks: [],
    evidence: [],
    limitations: [],
    isFixture: true,
    analysedAt: "2026-10-27T10:35:00.000Z",
  },
];

describe("Analytics Telemetry & Metrics Computation", () => {
  // 1. Empty Dataset Handling
  it("handles empty datasets safely without NaN or division by zero", () => {
    const providerStats = calculateProviderDistribution([]);
    const domainStats = calculateDomainDistribution([]);
    const routingStats = calculateDnsRoutingStats([]);
    const smtpStats = calculateSmtpCoverageStats([]);
    const qualityStats = calculateDataQualityStats([]);

    assert.deepEqual(providerStats, []);
    assert.deepEqual(domainStats, []);
    assert.equal(routingStats.hasMx, 0);
    assert.equal(routingStats.nxdomain, 0);
    assert.equal(smtpStats.probed, 0);
    assert.equal(qualityStats.syntaxPassRate, 0);
    assert.equal(qualityStats.duplicateRate, 0);
  });

  // 2. Email Provider Inference
  it("infers major consumer providers correctly by domain", () => {
    assert.equal(inferEmailProvider("user@gmail.com"), "Google Workspace / Gmail");
    assert.equal(inferEmailProvider("user@googlemail.com"), "Google Workspace / Gmail");
    assert.equal(inferEmailProvider("user@outlook.com"), "Microsoft 365 / Outlook");
    assert.equal(inferEmailProvider("user@hotmail.com"), "Microsoft 365 / Outlook");
    assert.equal(inferEmailProvider("user@yahoo.com"), "Yahoo Mail");
    assert.equal(inferEmailProvider("user@icloud.com"), "Apple iCloud");
    assert.equal(inferEmailProvider("user@proton.me"), "Proton Mail");
    assert.equal(inferEmailProvider("user@zoho.com"), "Zoho Mail");
    assert.equal(inferEmailProvider("user@fastmail.com"), "Fastmail");
    assert.equal(inferEmailProvider("user@aol.com"), "AOL Mail");
  });

  it("infers corporate providers from MX evidence and defaults custom domains to Unknown", () => {
    // Custom domain with Microsoft MX evidence
    assert.equal(
      inferEmailProvider("ceo@enterprise.com", ["MX: enterprise-com.mail.protection.outlook.com"]),
      "Microsoft 365 / Outlook"
    );

    // Custom domain with Google Workspace MX evidence
    assert.equal(
      inferEmailProvider("team@startup.io", ["MX: aspmx.l.google.com"]),
      "Google Workspace / Gmail"
    );

    // Custom domain with no matching MX evidence -> Custom / Unknown Provider
    assert.equal(
      inferEmailProvider("contact@independent.org", ["MX: mail.independent.org"]),
      "Custom / Unknown Provider"
    );

    // Completely unknown domain without evidence
    assert.equal(
      inferEmailProvider("hello@unknown-server.xyz"),
      "Custom / Unknown Provider"
    );
  });

  // 3. Provider Distribution
  it("calculates provider distribution counts and percentages", () => {
    const stats = calculateProviderDistribution(MOCK_ANALYTICS_RECORDS);
    assert.ok(stats.length >= 3);

    const google = stats.find((s) => s.provider === "Google Workspace / Gmail");
    assert.ok(google);
    assert.equal(google.count, 2); // r1 and r2
    assert.equal(google.delivered, 2);

    const m365 = stats.find((s) => s.provider === "Microsoft 365 / Outlook");
    assert.ok(m365);
    assert.equal(m365.count, 1); // r3

    const custom = stats.find((s) => s.provider === "Custom / Unknown Provider");
    assert.ok(custom);
    assert.ok(custom.count >= 2);
  });

  // 4. Domain Distribution
  it("calculates domain distribution ranking and normalizes case", () => {
    const domains = calculateDomainDistribution(MOCK_ANALYTICS_RECORDS);
    const gmail = domains.find((d) => d.domain === "gmail.com");
    assert.ok(gmail);
    assert.equal(gmail.count, 2); // r1 and r2 both grouped under gmail.com
    assert.equal(gmail.delivered, 2);
  });

  // 5. DNS and Mail-Routing Outcomes
  it("correctly identifies active MX, NXDOMAIN, and null MX (RFC 7505)", () => {
    const routing = calculateDnsRoutingStats(MOCK_ANALYTICS_RECORDS);
    assert.equal(routing.nxdomain, 1); // r5
    assert.equal(routing.nullMx, 1); // r6
    assert.ok(routing.hasMx >= 4); // r1, r2, r3, r4, r8
  });

  // 6. SMTP Coverage and Safe Inconclusive Classification
  it("treats timeouts as inconclusive/unavailable, never as fatal bounces", () => {
    const smtp = calculateSmtpCoverageStats(MOCK_ANALYTICS_RECORDS);
    assert.equal(smtp.accepted, 3); // r1, r2, r3
    assert.equal(smtp.inconclusiveOrGreylisted, 1); // r4 (timeout on port 25)
    assert.equal(smtp.unavailableOrBlocked, 1); // r8 (port 25 blocked)
    assert.equal(smtp.skippedOrDisabled, 3); // r5, r6, r7
    assert.equal(smtp.rejected, 0); // No 5xx fatal rejects in fixture
  });

  // 7. Data Quality, Duplicate Handling, and Syntax Hygiene
  it("calculates unique addresses, duplicate rate, and syntax pass rate", () => {
    const quality = calculateDataQualityStats(MOCK_ANALYTICS_RECORDS);
    assert.equal(quality.syntaxValidCount, 7); // 7 passed syntax
    assert.equal(quality.syntaxInvalidCount, 1); // r7 failed syntax
    assert.equal(quality.syntaxPassRate, 87.5); // 7 / 8 = 87.5%

    assert.equal(quality.uniqueAddressesCount, 7); // 8 records with 1 duplicate (alice@gmail.com)
    assert.equal(quality.duplicateCount, 1);
    assert.equal(quality.duplicateRate, 12.5); // 1 / 8 = 12.5%

    assert.equal(quality.fixtureCount, 1); // r8 is RFC 2606 fixture
    assert.equal(quality.fixtureRate, 12.5);
  });
});
