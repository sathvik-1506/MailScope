import type { DetailedAddressResult, Verdict } from "../types";

/**
 * Centrally filters analysis results by verdict and multi-attribute search query.
 * Guarantees that the results table, filter bar counters, and CSV export use
 * the exact same filtered dataset.
 */
export function filterResults(
  results: DetailedAddressResult[],
  selectedVerdict: Verdict | "all",
  searchQuery: string
): DetailedAddressResult[] {
  const q = searchQuery.trim().toLowerCase();

  return results.filter((r) => {
    // 1. Verdict Filter
    if (selectedVerdict !== "all" && r.verdict !== selectedVerdict) {
      return false;
    }

    // 2. Multi-field Search Query
    if (q.length > 0) {
      const matchAddress = r.address.toLowerCase().includes(q);
      const matchNormalized = r.normalizedAddress
        ? r.normalizedAddress.toLowerCase().includes(q)
        : false;
      const matchReason = r.reason.toLowerCase().includes(q);
      const matchReasonCode = r.reasonCode
        ? r.reasonCode.toLowerCase().includes(q)
        : false;
      const matchEvidence = r.evidence.some((e) => e.toLowerCase().includes(q));

      if (
        !matchAddress &&
        !matchNormalized &&
        !matchReason &&
        !matchReasonCode &&
        !matchEvidence
      ) {
        return false;
      }
    }

    return true;
  });
}
