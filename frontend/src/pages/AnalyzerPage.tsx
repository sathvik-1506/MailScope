import { useState, useRef } from "react";
import { HelpCircle, RotateCcw, FileText, UploadCloud } from "lucide-react";
import {
  AddressInputSection,
  FileUploadSection,
  SummaryCards,
  ResultsFilterBar,
  ResultsTable,
  EvidenceDrawer,
  MethodologyModal,
} from "../components/analyzer";
import { useAnalysis } from "../context/AnalysisContext";
import { analyzeAddresses, APIClientError } from "../services/api";
import { SAMPLE_INPUT_BATCH, parseInputAddresses } from "../services/analyzerAdapter";
import { downloadResultsCsv } from "../utils/csvExport";
import { filterResults } from "../utils/filterResults";
import { BRAND } from "../constants/brand";

export default function AnalyzerPage() {
  const {
    results,
    setResults,
    addBatchToHistory,
    logExport,
    selectedRecord,
    setSelectedRecord,
    selectedVerdict,
    setSelectedVerdict,
  } = useAnalysis();

  // Input state
  const [input, setInput] = useState<string>("");
  const [inputMode, setInputMode] = useState<"manual" | "upload">("manual");

  // Execution state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStep, setProgressStep] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active query parameters for retry
  const lastRequestRef = useRef<{ addresses: string[]; smtpEnabled: boolean } | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Core Real API Submission Handler
  const handleAnalyze = async (addresses: string[], smtpEnabled: boolean) => {
    if (isLoading || addresses.length === 0) return;

    lastRequestRef.current = { addresses, smtpEnabled };
    setIsLoading(true);
    setErrorMessage(null);
    setResults([]);
    setSelectedRecord(null);
    setProgressPercent(20);
    setProgressStep(`Connecting to ${BRAND.name} engine for ${addresses.length} addresses...`);

    const progressTimer1 = setTimeout(() => {
      setProgressPercent(50);
      setProgressStep("Executing syntax validation and DNS MX resolution...");
    }, 200);

    const progressTimer2 = setTimeout(() => {
      setProgressPercent(80);
      setProgressStep(
        smtpEnabled
          ? "Probing SMTP recipient handshakes and evaluating catch-all signals..."
          : "Compiling Evidence Ledger and verdict classifications..."
      );
    }, 450);

    try {
      const data = await analyzeAddresses({
        addresses,
        smtp_enabled: smtpEnabled,
      });

      setProgressPercent(100);
      setProgressStep("Verification complete.");
      setResults(data);

      // Record this run in session history
      addBatchToHistory({
        title: `Batch (${data.length} addresses)`,
        addressesCount: data.length,
        deliveredCount: data.filter((r) => r.verdict === "likely_delivered").length,
        bounceCount: data.filter((r) => r.verdict === "likely_bounce").length,
        unknownCount: data.filter((r) => r.verdict === "unknown").length,
        smtpProbed: smtpEnabled,
        results: data,
      });
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorMessage(err.message);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Application error: ${msg}`);
      }
    } finally {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      setIsLoading(false);
      setProgressPercent(0);
      setProgressStep("");
    }
  };

  const handleLoadSample = () => {
    setInput(SAMPLE_INPUT_BATCH);
  };

  const handleResetWorkspace = () => {
    setInput("");
    setResults([]);
    setErrorMessage(null);
    setSearchQuery("");
    setSelectedVerdict("all");
    setSelectedRecord(null);
    lastRequestRef.current = null;
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedVerdict("all");
  };

  const handleRetry = () => {
    if (lastRequestRef.current && lastRequestRef.current.addresses.length > 0) {
      handleAnalyze(lastRequestRef.current.addresses, lastRequestRef.current.smtpEnabled);
    } else {
      const parsed = parseInputAddresses(input);
      if (parsed.length > 0) {
        handleAnalyze(parsed, false);
      }
    }
  };

  const filteredResults = filterResults(results, selectedVerdict, searchQuery);

  const handleExportCsv = () => {
    const filename = downloadResultsCsv(filteredResults);
    logExport(filename, filteredResults.length, selectedVerdict);
  };

  const filteredCount = filteredResults.length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Page Header with Title and Methodology Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Verification Engine
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Analyze Email Addresses
          </h1>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
            Evaluate address batches against RFC syntax rules, live DNS/MX records, and non-disruptive SMTP signals. Every result explains its evidence and limitations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer"
            title="Verification methodology & RFC limitations"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Methodology</span>
          </button>

          {results.length > 0 && (
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer"
              title="Reset current batch"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Mode Selector: Manual Paste vs. Document File Upload */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 cursor-pointer ${
              inputMode === "manual"
                ? "border-brand-500 text-brand-500 bg-surface-secondary dark:bg-surface-elevated/40"
                : "border-transparent text-text-muted hover:text-text-primary hover:bg-surface-elevated/20"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Manual Text Input</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode("upload")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 cursor-pointer ${
              inputMode === "upload"
                ? "border-brand-500 text-brand-500 bg-surface-secondary dark:bg-surface-elevated/40"
                : "border-transparent text-text-muted hover:text-text-primary hover:bg-surface-elevated/20"
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Upload Documents (.txt, .csv, .pdf, .docx, .eml)</span>
          </button>
        </div>

        {inputMode === "manual" ? (
          <AddressInputSection
            input={input}
            onChangeInput={setInput}
            onAnalyze={handleAnalyze}
            isLoading={isLoading}
            progressPercent={progressPercent}
            progressStep={progressStep}
          />
        ) : (
          <FileUploadSection
            onAnalyzeAddresses={handleAnalyze}
            onAppendToManualInput={(newAddrs) => {
              setInput((prev) => {
                const existing = prev.trim();
                const joined = newAddrs.join("\n");
                return existing ? `${existing}\n${joined}` : joined;
              });
              setInputMode("manual");
            }}
            isLoadingAnalysis={isLoading}
          />
        )}
      </div>

      {/* 3. Summary Cards for the three verdicts */}
      {results.length > 0 && (
        <SummaryCards
          results={results}
          activeFilter={selectedVerdict}
          onSelectFilter={setSelectedVerdict}
        />
      )}

      {/* 4. Results Table with Search & Filter controls */}
      <div className="space-y-4">
        {results.length > 0 && (
          <ResultsFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedVerdict={selectedVerdict}
            onVerdictChange={setSelectedVerdict}
            totalCount={results.length}
            filteredCount={filteredCount}
            onExportCsv={handleExportCsv}
            onResetWorkspace={handleResetWorkspace}
          />
        )}

        <ResultsTable
          results={results}
          searchQuery={searchQuery}
          selectedVerdict={selectedVerdict}
          onSelectRecord={setSelectedRecord}
          onLoadSample={handleLoadSample}
          onClearFilters={handleClearFilters}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDismissError={() => setErrorMessage(null)}
        />
      </div>

      {/* 5. Evidence Detail Drawer */}
      <EvidenceDrawer
        result={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />

      {/* 6. Methodology & Limitations Modal */}
      <MethodologyModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
