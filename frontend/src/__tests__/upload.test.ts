import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractEmailsFromFiles, APIClientError } from "../services/api";
import type { ExtractionResponse } from "../types";

describe("Document Email Extraction Client & Validation", () => {
  it("rejects empty file lists immediately without making network calls", async () => {
    await assert.rejects(
      async () => {
        await extractEmailsFromFiles([]);
      },
      (err: any) => {
        assert.ok(err instanceof APIClientError);
        assert.equal(err.code, "NO_FILES_PROVIDED");
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("safely handles network failure / connection refused", async () => {
    // Mock global fetch to reject
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Failed to connect to backend server");
    };

    try {
      const dummyFile = new File(["test@example.com"], "test.txt", { type: "text/plain" });
      await assert.rejects(
        async () => {
          await extractEmailsFromFiles([dummyFile]);
        },
        (err: any) => {
          assert.ok(err instanceof APIClientError);
          assert.equal(err.code, "CONNECTION_REFUSED");
          assert.equal(err.isNetworkError, true);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles structured backend error response with specific error code", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: "File 'document.doc' is in legacy binary Word format (.doc). Please convert or save the file as modern Word (.docx) or plain text (.txt).",
          code: "LEGACY_DOC_NOT_SUPPORTED",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    try {
      const dummyFile = new File(["dummy"], "document.doc", { type: "application/msword" });
      await assert.rejects(
        async () => {
          await extractEmailsFromFiles([dummyFile]);
        },
        (err: any) => {
          assert.ok(err instanceof APIClientError);
          assert.equal(err.status, 400);
          assert.equal(err.code, "LEGACY_DOC_NOT_SUPPORTED");
          assert.match(err.message, /legacy binary Word format/);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses successful extraction response containing candidates, files, and counts", async () => {
    const mockResponse: ExtractionResponse = {
      candidates: [
        {
          address: "contact@example.com",
          normalized: "contact@example.com",
          source_file: "contacts.csv",
          location: "Row 2, Col 2",
          all_sources: [
            { file: "contacts.csv", location: "Row 2, Col 2" },
            { file: "notes.txt", location: "Line 4" },
          ],
          occurrences: 2,
        },
        {
          address: "sales@enterprise.org",
          normalized: "sales@enterprise.org",
          source_file: "notes.txt",
          location: "Line 12",
          all_sources: [{ file: "notes.txt", location: "Line 12" }],
          occurrences: 1,
        },
      ],
      unique_count: 2,
      total_detected: 3,
      duplicates_removed: 1,
      files: [
        {
          filename: "contacts.csv",
          size_bytes: 512,
          status: "success",
          candidates_found: 1,
          warnings: [],
        },
        {
          filename: "notes.txt",
          size_bytes: 1024,
          status: "success",
          candidates_found: 2,
          warnings: [],
        },
      ],
      warnings: [],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const file1 = new File(["dummy"], "contacts.csv", { type: "text/csv" });
      const res = await extractEmailsFromFiles([file1]);

      assert.equal(res.unique_count, 2);
      assert.equal(res.total_detected, 3);
      assert.equal(res.duplicates_removed, 1);
      assert.equal(res.candidates.length, 2);
      assert.equal(res.candidates[0].occurrences, 2);
      assert.equal(res.files.length, 2);
      assert.equal(res.files[0].status, "success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates warnings when a scanned PDF has no extractable text", async () => {
    const mockResponse: ExtractionResponse = {
      candidates: [],
      unique_count: 0,
      total_detected: 0,
      duplicates_removed: 0,
      files: [
        {
          filename: "scanned_invoice.pdf",
          size_bytes: 45000,
          status: "warning",
          candidates_found: 0,
          warnings: [
            "PDF contains 1 pages with no extractable text. Scanned-image PDFs require OCR conversion to searchable text before extraction.",
          ],
        },
      ],
      warnings: [
        "scanned_invoice.pdf: PDF contains 1 pages with no extractable text. Scanned-image PDFs require OCR conversion to searchable text before extraction.",
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const file = new File(["%PDF-dummy"], "scanned_invoice.pdf", { type: "application/pdf" });
      const res = await extractEmailsFromFiles([file]);

      assert.equal(res.unique_count, 0);
      assert.equal(res.warnings.length, 1);
      assert.match(res.warnings[0], /Scanned-image PDFs require OCR conversion/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
