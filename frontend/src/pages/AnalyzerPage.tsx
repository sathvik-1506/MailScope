import { useState, useRef } from "react";
import type { DetailedAddressResult, Verdict } from "../types";
import {
  AnalyzerHeader,
  AddressInputSection,
  SummaryCards,
  ResultsFilterBar,
  ResultsTable,
  EvidenceDrawer,
  MethodologyModal,
} from "../components/analyzer";
import { Footer } from "../components";
import { analyzeAddresses, APIClientError } from "../services/api";
import { SAMPLE_INPUT_BATCH, parseInputAddresses } from "../services/analyzerAdapter";
import { downloadResultsCsv } from "../utils/csvExport";
import { filterResults } from "../utils/filterResults";
import { BRAND } from "../constants/brand";

export default function AnalyzerPage() {
  // Input state
  const [input, setInput] = useState<string>("");

  // Analysis results & execution state
  const [results, setResults] = useState<DetailedAddressResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStep, setProgressStep] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active query parameters for retry
  const lastRequestRef = useRef<{ addresses: string[]; smtpEnabled: boolean } | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | "all">("all");

  // Drawer & Modal state
  const [selectedRecord, setSelectedRecord] = useState<DetailedAddressResult | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Core Real API Submission Handler
  const handleAnalyze = async (addresses: string[], smtpEnabled: boolean) => {
    if (isLoading || addresses.length === 0) return;

    lastRequestRef.current = { addresses, smtpEnabled };
    setIsLoading(true);
    setErrorMessage(null);
    // Clear stale results immediately so they are never presented as a new completed analysis
    setResults([]);
    setSelectedRecord(null);
    setProgressPercent(20);
    setProgressStep(`Connecting to ${BRAND.name} engine for ${addresses.length} addresses...`);

    // Dynamic progress feedback
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

  // Centralized filtered result set shared across table, summary counters, and CSV export
  const filteredResults = filterResults(results, selectedVerdict, searchQuery);

  const handleExportCsv = () => {
    downloadResultsCsv(filteredResults);
  };

  const filteredCount = filteredResults.length;

  return (
    <div className="min-h-screen flex flex-col bg-surface-primary text-text-primary">
      {/* 1. Header with logo, navigation, and return home */}
      <AnalyzerHeader onOpenHelp={() => setIsHelpOpen(true)} />

      {/* Main Container */}
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* 2. Page Title & Explanatory Text */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-subtle pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
                <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
                  Deliverability Workspace
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
                Email Deliverability Analyzer
              </h1>
              <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
                Evaluate batches of email addresses against RFC syntax rules, live DNS/MX records, and non-disruptive SMTP signals. Every result explains its evidence and limitations.
              </p>
            </div>

            <div className="text-xs text-text-muted sm:text-right">
              <div>RFC 5321 &bull; RFC 5322 &bull; DNS MX</div>
              <div className="text-brand-400 font-medium mt-0.5">Stateless verification</div>
            </div>
          </div>

          {/* 3-8. Input Section */}
          <AddressInputSection
            input={input}
            onChangeInput={setInput}
            onAnalyze={handleAnalyze}
            isLoading={isLoading}
            progressPercent={progressPercent}
            progressStep={progressStep}
          />

          {/* 9. Summary Cards for the three verdicts */}
          {results.length > 0 && (
            <SummaryCards
              results={results}
              activeFilter={selectedVerdict}
              onSelectFilter={setSelectedVerdict}
            />
          )}

          {/* 10. Results Table with Search & Filter controls */}
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
        </div>
      </main>

      {/* 11. Evidence Detail Drawer */}
      <EvidenceDrawer
        result={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />

      {/* Methodology & Limitations Modal */}
      <MethodologyModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* 14. Professional Footer */}
      <Footer />
    </div>
  );
}
