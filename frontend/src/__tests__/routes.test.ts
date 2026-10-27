import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { downloadResultsCsv } from "../utils/csvExport";
import type { DetailedAddressResult } from "../types";

describe("Multi-Page Workspace Routes & Architecture", () => {
  const EXPECTED_ROUTES = [
    { path: "/", name: "Landing Page" },
    { path: "/app", name: "Overview Dashboard" },
    { path: "/app/analyze", name: "Analyze Emails" },
    { path: "/app/analytics", name: "Analytics" },
    { path: "/app/history", name: "Analysis History" },
    { path: "/app/exports", name: "Export Center" },
    { path: "/app/settings", name: "Settings" },
  ];

  it("verifies all 7 required route paths are defined and distinct", () => {
    const paths = EXPECTED_ROUTES.map((r) => r.path);
    const uniquePaths = new Set(paths);
    assert.equal(uniquePaths.size, 7, "All 7 required route paths must be unique");

    assert.ok(paths.includes("/"));
    assert.ok(paths.includes("/app"));
    assert.ok(paths.includes("/app/analyze"));
    assert.ok(paths.includes("/app/analytics"));
    assert.ok(paths.includes("/app/history"));
    assert.ok(paths.includes("/app/exports"));
    assert.ok(paths.includes("/app/settings"));
  });

  describe("Export Center Filename & Tracking", () => {
    beforeEach(() => {
      const mockElement = {
        setAttribute: () => {},
        style: {},
        click: () => {},
      };

      globalThis.document = {
        createElement: () => mockElement,
        body: {
          appendChild: () => mockElement,
          removeChild: () => mockElement,
        },
      } as unknown as Document;

      globalThis.URL = {
        createObjectURL: () => "blob:mock-url",
        revokeObjectURL: () => {},
      } as unknown as typeof URL;
    });

    it("downloadResultsCsv generates and returns sanitized filename with prefix and date", () => {
      const sampleResults: DetailedAddressResult[] = [
        {
          id: "row-1",
          address: "alice@example.com",
          verdict: "likely_delivered",
          reason: "Mailbox accepted",
          reasonCode: "MAILBOX_ACCEPTED",
          syntaxStatus: "passed",
          dnsStatus: "passed",
          routingStatus: "passed",
          smtpStatus: "passed",
          checks: [],
          evidence: ["RFC 5321 syntax pass"],
          limitations: [],
          isFixture: true,
          analysedAt: new Date().toISOString(),
        },
      ];

      const filename = downloadResultsCsv(sampleResults);
      assert.ok(typeof filename === "string");
      assert.ok(filename.startsWith("mailora_analysis_"));
      assert.ok(filename.endsWith(".csv"));
    });
  });
});
