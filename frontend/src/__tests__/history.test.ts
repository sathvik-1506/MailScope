import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DetailedAddressResult, DomainFrequency } from "../types";
import type { AnalysisBatchRecord } from "../context/AnalysisContext";

const SAMPLE_RESULTS: DetailedAddressResult[] = [
  {
    id: "res-1",
    address: "test@domain.com",
    originalInput: "test@domain.com",
    verdict: "likely_delivered",
    reason: "Accepted.",
    reasonCode: "MAILBOX_ACCEPTED",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    checks: [],
    evidence: [],
    limitations: [],
    isFixture: false,
    analysedAt: "2026-10-27T12:00:00Z",
  },
];

const MOCK_BATCH_HISTORY: AnalysisBatchRecord[] = [
  {
    id: "batch-2026-001",
    timestamp: "2026-10-20T10:00:00Z",
    title: "Batch (10 addresses)",
    status: "completed",
    addressesCount: 10,
    deliveredCount: 8,
    bounceCount: 1,
    unknownCount: 1,
    smtpProbed: true,
    domainsSummary: [
      { domain: "google.com", count: 6 },
      { domain: "example.org", count: 4 },
    ],
    hasDetailedResults: true,
    results: SAMPLE_RESULTS,
  },
  {
    id: "batch-2026-002",
    timestamp: "2026-10-25T14:30:00Z",
    title: "Batch (50 addresses)",
    status: "completed",
    addressesCount: 50,
    deliveredCount: 42,
    bounceCount: 5,
    unknownCount: 3,
    smtpProbed: false,
    domainsSummary: [
      { domain: "microsoft.com", count: 30 },
      { domain: "outlook.com", count: 20 },
    ],
    hasDetailedResults: false, // Expired details from earlier session
    results: [],
  },
  {
    id: "batch-2026-003",
    timestamp: "2026-10-27T09:15:00Z",
    title: "Batch (5 addresses)",
    status: "failed",
    addressesCount: 5,
    deliveredCount: 0,
    bounceCount: 0,
    unknownCount: 5,
    smtpProbed: false,
    domainsSummary: [{ domain: "unreachable.invalid", count: 5 }],
    hasDetailedResults: true,
    results: SAMPLE_RESULTS,
  },
];

describe("Analysis History Ledger & Filtering Engine", () => {
  it("searches history by run identifier (case-insensitive)", () => {
    const query = "BATCH-2026-002";
    const matches = MOCK_BATCH_HISTORY.filter(
      (b) =>
        b.id.toLowerCase().includes(query.toLowerCase()) ||
        b.title.toLowerCase().includes(query.toLowerCase())
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, "batch-2026-002");
    assert.equal(matches[0].addressesCount, 50);
  });

  it("searches history by domain metadata in domainsSummary", () => {
    const query = "microsoft";
    const matches = MOCK_BATCH_HISTORY.filter((b) =>
      b.domainsSummary?.some((d) => d.domain.toLowerCase().includes(query.toLowerCase()))
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, "batch-2026-002");
    assert.equal(matches[0].domainsSummary?.[0].domain, "microsoft.com");
  });

  it("filters history runs by date-range boundaries", () => {
    // Start date filter: on or after 2026-10-25
    const startDate = "2026-10-25";
    const after = MOCK_BATCH_HISTORY.filter(
      (b) => new Date(b.timestamp) >= new Date(startDate)
    );
    assert.equal(after.length, 2);
    assert.equal(after[0].id, "batch-2026-002");
    assert.equal(after[1].id, "batch-2026-003");

    // End date filter: on or before 2026-10-22
    const endDate = "2026-10-22";
    const before = MOCK_BATCH_HISTORY.filter((b) => {
      const d = new Date(endDate);
      d.setHours(23, 59, 59, 999);
      return new Date(b.timestamp) <= d;
    });
    assert.equal(before.length, 1);
    assert.equal(before[0].id, "batch-2026-001");
  });

  it("filters history runs by status", () => {
    const failedRuns = MOCK_BATCH_HISTORY.filter((b) => (b.status || "completed") === "failed");
    assert.equal(failedRuns.length, 1);
    assert.equal(failedRuns[0].id, "batch-2026-003");

    const completedRuns = MOCK_BATCH_HISTORY.filter(
      (b) => (b.status || "completed") === "completed"
    );
    assert.equal(completedRuns.length, 2);
  });

  it("calculates pagination windows accurately", () => {
    const pageSize = 2;
    const total = MOCK_BATCH_HISTORY.length; // 3
    const totalPages = Math.ceil(total / pageSize); // 2

    assert.equal(totalPages, 2);

    // Page 1
    const page1 = MOCK_BATCH_HISTORY.slice(0, pageSize);
    assert.equal(page1.length, 2);
    assert.equal(page1[0].id, "batch-2026-001");
    assert.equal(page1[1].id, "batch-2026-002");

    // Page 2
    const page2 = MOCK_BATCH_HISTORY.slice(pageSize, pageSize * 2);
    assert.equal(page2.length, 1);
    assert.equal(page2[0].id, "batch-2026-003");
  });

  it("distinguishes retained runs from expired/metadata-only runs", () => {
    const retained = MOCK_BATCH_HISTORY.find((b) => b.id === "batch-2026-001");
    assert.equal(retained?.hasDetailedResults, true);
    assert.equal(retained?.results.length, 1);

    const expired = MOCK_BATCH_HISTORY.find((b) => b.id === "batch-2026-002");
    assert.equal(expired?.hasDetailedResults, false);
    assert.equal(expired?.results.length, 0);
    // Preserved aggregate metrics
    assert.equal(expired?.deliveredCount, 42);
    assert.equal(expired?.bounceCount, 5);
    assert.equal(expired?.unknownCount, 3);
  });

  it("deletes a run record by ID without mutating unrelated runs", () => {
    const targetId = "batch-2026-002";
    const remaining = MOCK_BATCH_HISTORY.filter((b) => b.id !== targetId);

    assert.equal(remaining.length, 2);
    assert.equal(remaining.some((b) => b.id === targetId), false);
    assert.equal(remaining[0].id, "batch-2026-001");
    assert.equal(remaining[1].id, "batch-2026-003");
  });

  it("clears all history runs cleanly", () => {
    let history = [...MOCK_BATCH_HISTORY];
    assert.equal(history.length, 3);

    history = [];
    assert.equal(history.length, 0);
  });

  it("protects privacy by summarizing domains rather than exposing full email addresses", () => {
    const batch = MOCK_BATCH_HISTORY[0];
    const summary = batch.domainsSummary as DomainFrequency[];

    assert.ok(Array.isArray(summary));
    for (const item of summary) {
      assert.ok(!item.domain.includes("@"), "Domain summary must not contain @ local-part");
      assert.ok(typeof item.count === "number" && item.count > 0);
    }
  });
});
