import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { DetailedAddressResult, Verdict, DomainFrequency } from "../types";
import {
  fetchHistoryRuns,
  deleteHistoryRun,
  clearAllHistoryRuns,
} from "../services/api";

export interface AnalysisBatchRecord {
  id: string;
  timestamp: string;
  title: string;
  status?: "completed" | "failed" | string;
  addressesCount: number;
  deliveredCount: number;
  bounceCount: number;
  unknownCount: number;
  smtpProbed: boolean;
  domainsSummary?: DomainFrequency[];
  hasDetailedResults?: boolean;
  results: DetailedAddressResult[];
}

export interface ExportRecord {
  id: string;
  timestamp: string;
  filename: string;
  recordCount: number;
  format: "CSV" | "JSON";
  filter: Verdict | "all";
}

export interface AnalysisContextValue {
  // Active/latest results in current workspace session
  results: DetailedAddressResult[];
  setResults: (results: DetailedAddressResult[]) => void;
  // History of runs
  batchHistory: AnalysisBatchRecord[];
  addBatchToHistory: (
    batch: Omit<AnalysisBatchRecord, "id" | "timestamp"> & { id?: string; timestamp?: string }
  ) => void;
  deleteBatchFromHistory: (id: string) => Promise<boolean>;
  clearHistory: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  isSyncingHistory: boolean;
  historyError: string | null;
  // Export tracking
  exportHistory: ExportRecord[];
  logExport: (filename: string, recordCount: number, filter?: Verdict | "all") => void;
  // Active selection for details
  selectedRecord: DetailedAddressResult | null;
  setSelectedRecord: (record: DetailedAddressResult | null) => void;
  // Active filter
  selectedVerdict: Verdict | "all";
  setSelectedVerdict: (verdict: Verdict | "all") => void;
}

const STORAGE_KEY_HISTORY = "mailora_batch_history";
const MAX_LOCAL_BATCHES = 40;

function loadSavedHistory(): AnalysisBatchRecord[] {
  if (typeof window === "undefined") return [];

  // 1. Try durable localStorage
  try {
    const localRaw = window.localStorage.getItem(STORAGE_KEY_HISTORY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => ({
          ...item,
          hasDetailedResults: Array.isArray(item.results) && item.results.length > 0,
        }));
      }
    }
  } catch {
    // localStorage unavailable
  }

  // 2. Migration: Check legacy sessionStorage if localStorage was empty
  try {
    const sessionRaw = window.sessionStorage.getItem(STORAGE_KEY_HISTORY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Save into localStorage for persistence
        try {
          window.localStorage.setItem(STORAGE_KEY_HISTORY, sessionRaw);
        } catch {
          // ignore
        }
        return parsed.map((item) => ({
          ...item,
          hasDetailedResults: Array.isArray(item.results) && item.results.length > 0,
        }));
      }
    }
  } catch {
    // sessionStorage unavailable
  }

  return [];
}

function saveLocalHistory(history: AnalysisBatchRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch {
    // localStorage full or restricted
  }
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<DetailedAddressResult[]>([]);
  const [batchHistory, setBatchHistory] = useState<AnalysisBatchRecord[]>(loadSavedHistory);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DetailedAddressResult | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | "all">("all");
  const [isSyncingHistory, setIsSyncingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Sync with backend on initial mount
  const refreshHistory = useCallback(async () => {
    setIsSyncingHistory(true);
    setHistoryError(null);
    try {
      const backendData = await fetchHistoryRuns({ limit: 50 });
      if (backendData && Array.isArray(backendData.items)) {
        setBatchHistory((prev) => {
          const localMap = new Map<string, AnalysisBatchRecord>();
          for (const item of prev) {
            localMap.set(item.id, item);
          }

          // Merge backend runs
          for (const bRun of backendData.items) {
            if (localMap.has(bRun.id)) {
              // Local has full results, ensure metadata is updated
              const existing = localMap.get(bRun.id)!;
              localMap.set(bRun.id, {
                ...existing,
                status: bRun.status || existing.status || "completed",
                domainsSummary: bRun.domains_summary || existing.domainsSummary,
              });
            } else {
              // Backend run whose local details have expired or was run in another session
              localMap.set(bRun.id, {
                id: bRun.id,
                timestamp: bRun.created_at,
                title: `Batch (${bRun.addresses_count} addresses)`,
                status: bRun.status || "completed",
                addressesCount: bRun.addresses_count,
                deliveredCount: bRun.delivered_count,
                bounceCount: bRun.bounce_count,
                unknownCount: bRun.unknown_count,
                smtpProbed: bRun.smtp_enabled,
                domainsSummary: bRun.domains_summary || [],
                hasDetailedResults: false,
                results: [],
              });
            }
          }

          const merged = Array.from(localMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          saveLocalHistory(merged);
          return merged;
        });
      }
    } catch (err: unknown) {
      // Backend may be offline or local-only; retain local history cleanly
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg);
    } finally {
      setIsSyncingHistory(false);
    }
  }, []);

  useEffect(() => {
    // Schedule initial background sync without blocking render
    const t = setTimeout(() => {
      refreshHistory();
    }, 0);
    return () => clearTimeout(t);
  }, [refreshHistory]);


  const addBatchToHistory = useCallback(
    (
      batchData: Omit<AnalysisBatchRecord, "id" | "timestamp"> & {
        id?: string;
        timestamp?: string;
      }
    ) => {
      // Extract domain summary if not provided
      const domainMap: Record<string, number> = {};
      for (const res of batchData.results || []) {
        const d = (res.address ? res.address.split("@")[1] : "").toLowerCase().trim();
        if (d) domainMap[d] = (domainMap[d] || 0) + 1;
      }

      const domainsSummary: DomainFrequency[] = Object.entries(domainMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count }));

      const newBatch: AnalysisBatchRecord = {
        ...batchData,
        id: batchData.id || `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: batchData.timestamp || new Date().toISOString(),
        status: batchData.status || "completed",
        domainsSummary: batchData.domainsSummary || domainsSummary,
        hasDetailedResults: Array.isArray(batchData.results) && batchData.results.length > 0,
      };

      setBatchHistory((prev) => {
        // Deduplicate in case run with same ID already exists
        const filtered = prev.filter((b) => b.id !== newBatch.id);
        const updated = [newBatch, ...filtered.slice(0, MAX_LOCAL_BATCHES - 1)];
        saveLocalHistory(updated);
        return updated;
      });
    },
    []
  );

  const deleteBatchFromHistory = useCallback(async (id: string): Promise<boolean> => {
    setBatchHistory((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      saveLocalHistory(updated);
      return updated;
    });

    // Notify backend
    try {
      await deleteHistoryRun(id);
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearHistory = useCallback(async () => {
    setBatchHistory([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY_HISTORY);
        window.sessionStorage.removeItem(STORAGE_KEY_HISTORY);
      } catch {
        // Safe fallback
      }
    }

    try {
      await clearAllHistoryRuns();
    } catch {
      // ignore network errors on clear
    }
  }, []);

  const logExport = useCallback(
    (filename: string, recordCount: number, filter: Verdict | "all" = "all") => {
      const entry: ExportRecord = {
        id: `export-${Date.now()}`,
        timestamp: new Date().toISOString(),
        filename,
        recordCount,
        format: "CSV",
        filter,
      };
      setExportHistory((prev) => [entry, ...prev.slice(0, 9)]);
    },
    []
  );

  const value = useMemo<AnalysisContextValue>(
    () => ({
      results,
      setResults,
      batchHistory,
      addBatchToHistory,
      deleteBatchFromHistory,
      clearHistory,
      refreshHistory,
      isSyncingHistory,
      historyError,
      exportHistory,
      logExport,
      selectedRecord,
      setSelectedRecord,
      selectedVerdict,
      setSelectedVerdict,
    }),
    [
      results,
      setResults,
      batchHistory,
      addBatchToHistory,
      deleteBatchFromHistory,
      clearHistory,
      refreshHistory,
      isSyncingHistory,
      historyError,
      exportHistory,
      logExport,
      selectedRecord,
      setSelectedRecord,
      selectedVerdict,
      setSelectedVerdict,
    ]
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysis must be used within an AnalysisProvider");
  }
  return ctx;
}
