import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { DetailedAddressResult, Verdict } from "../types";

export interface AnalysisBatchRecord {
  id: string;
  timestamp: string;
  title: string;
  addressesCount: number;
  deliveredCount: number;
  bounceCount: number;
  unknownCount: number;
  smtpProbed: boolean;
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
  // History of runs in this session
  batchHistory: AnalysisBatchRecord[];
  addBatchToHistory: (batch: Omit<AnalysisBatchRecord, "id" | "timestamp">) => void;
  clearHistory: () => void;
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

function loadSavedHistory(): AnalysisBatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Session storage unavailable
  }
  return [];
}

function saveHistory(history: AnalysisBatchRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch {
    // Session storage full or restricted
  }
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<DetailedAddressResult[]>([]);
  const [batchHistory, setBatchHistory] = useState<AnalysisBatchRecord[]>(loadSavedHistory);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DetailedAddressResult | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | "all">("all");

  const addBatchToHistory = useCallback(
    (batchData: Omit<AnalysisBatchRecord, "id" | "timestamp">) => {
      const newBatch: AnalysisBatchRecord = {
        ...batchData,
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      };
      setBatchHistory((prev) => {
        const updated = [newBatch, ...prev.slice(0, 19)]; // Keep up to 20 batches in session
        saveHistory(updated);
        return updated;
      });
    },
    []
  );

  const clearHistory = useCallback(() => {
    setBatchHistory([]);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY_HISTORY);
      } catch {
        // Safe fallback
      }
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
      clearHistory,
      exportHistory,
      logExport,
      selectedRecord,
      setSelectedRecord,
      selectedVerdict,
      setSelectedVerdict,
    }),
    [
      results,
      batchHistory,
      addBatchToHistory,
      clearHistory,
      exportHistory,
      logExport,
      selectedRecord,
      selectedVerdict,
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
