import { useState, useRef, useId, type DragEvent, type ChangeEvent } from "react";
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  Info,
  ArrowRight,
  ShieldAlert,
  X,
} from "lucide-react";
import { extractEmailsFromFiles, APIClientError } from "../../services/api";
import type { ExtractedCandidate, ExtractionResponse, ExtractionFileReport } from "../../types";

interface FileUploadSectionProps {
  onAnalyzeAddresses: (addresses: string[], smtpEnabled: boolean) => void;
  onAppendToManualInput: (addresses: string[]) => void;
  isLoadingAnalysis: boolean;
}

const SUPPORTED_EXTENSIONS = [".txt", ".csv", ".pdf", ".docx", ".eml"];
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function FileUploadSection({
  onAnalyzeAddresses,
  onAppendToManualInput,
  isLoadingAnalysis,
}: FileUploadSectionProps) {
  const fileInputId = useId();
  const manualAddId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload & Extraction States
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileValidationErrors, setFileValidationErrors] = useState<string[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Extracted Results State
  const [extractionResult, setExtractionResult] = useState<ExtractionResponse | null>(null);
  const [candidates, setCandidates] = useState<ExtractedCandidate[]>([]);
  const [selectedCandidateAddresses, setSelectedCandidateAddresses] = useState<Set<string>>(new Set());

  // Quick Manual Add State
  const [manualAddressInput, setManualAddressInput] = useState("");
  const [manualAddError, setManualAddError] = useState<string | null>(null);

  // Options
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  // File Validation Helper
  const validateAndFilterFiles = (incoming: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    if (incoming.length + selectedFiles.length > MAX_FILES) {
      errors.push(`Maximum ${MAX_FILES} files allowed per upload. Only first ${MAX_FILES} considered.`);
    }

    const availableSlots = Math.max(0, MAX_FILES - selectedFiles.length);
    const toProcess = incoming.slice(0, availableSlots);

    for (const file of toProcess) {
      const lowerName = file.name.toLowerCase();
      const ext = lowerName.slice(lowerName.lastIndexOf("."));

      // Check for legacy .doc
      if (ext === ".doc") {
        errors.push(
          `'${file.name}': Legacy Word (.doc) format is not supported. Please save or convert to modern Word (.docx) or plain text (.txt).`
        );
        continue;
      }

      // Check for executables or scripts
      if ([".exe", ".bat", ".cmd", ".sh", ".dll", ".bin", ".com", ".msi", ".jar"].includes(ext)) {
        errors.push(`'${file.name}': Executable files and scripts cannot be uploaded for security reasons.`);
        continue;
      }

      // Check for archives
      if ([".zip", ".tar", ".gz", ".7z", ".rar"].includes(ext)) {
        errors.push(`'${file.name}': Archive files (.zip, etc.) are not accepted. Please extract and upload files individually.`);
        continue;
      }

      // Check supported format
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        errors.push(
          `'${file.name}': Unsupported format '${ext}'. Supported formats: .txt, .csv, .pdf, .docx, .eml.`
        );
        continue;
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(
          `'${file.name}' (${formatBytes(file.size)}) exceeds the maximum allowed size of 5 MB.`
        );
        continue;
      }

      if (file.size === 0) {
        errors.push(`'${file.name}' is empty (0 bytes).`);
        continue;
      }

      valid.push(file);
    }

    return { valid, errors };
  };

  const handleFilesSelected = (filesToAdd: File[]) => {
    setGeneralError(null);
    const { valid, errors } = validateAndFilterFiles(filesToAdd);
    setFileValidationErrors(errors);

    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(Array.from(e.target.files));
    }
    // Reset file input value to allow re-selection of the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileValidationErrors([]);
  };

  const handleClearSelectedFiles = () => {
    setSelectedFiles([]);
    setFileValidationErrors([]);
    setGeneralError(null);
  };

  // Perform backend extraction
  const handleStartExtraction = async () => {
    if (selectedFiles.length === 0 || isExtracting) return;

    setIsExtracting(true);
    setGeneralError(null);
    setFileValidationErrors([]);

    try {
      const data = await extractEmailsFromFiles(selectedFiles);
      setExtractionResult(data);
      setCandidates(data.candidates);
      // Select all candidate addresses by default for review
      setSelectedCandidateAddresses(new Set(data.candidates.map((c) => c.address)));
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setGeneralError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setGeneralError(`Extraction failed: ${msg}`);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  // Candidate selection / removal
  const toggleCandidate = (addr: string) => {
    setSelectedCandidateAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) {
        next.delete(addr);
      } else {
        next.add(addr);
      }
      return next;
    });
  };

  const selectAllCandidates = () => {
    setSelectedCandidateAddresses(new Set(candidates.map((c) => c.address)));
  };

  const deselectAllCandidates = () => {
    setSelectedCandidateAddresses(new Set());
  };

  const handleRemoveCandidate = (addr: string) => {
    setCandidates((prev) => prev.filter((c) => c.address !== addr));
    setSelectedCandidateAddresses((prev) => {
      const next = new Set(prev);
      next.delete(addr);
      return next;
    });
  };

  const handleClearCandidates = () => {
    setCandidates([]);
    setSelectedCandidateAddresses(new Set());
    setExtractionResult(null);
  };

  // Add manual address directly to candidate list
  const handleAddManualAddress = (e: React.FormEvent) => {
    e.preventDefault();
    setManualAddError(null);
    const raw = manualAddressInput.trim();
    if (!raw) return;

    // Split on comma or whitespace if multiple
    const tokens = raw.split(/[\s,;]+/).filter(Boolean);
    const newItems: ExtractedCandidate[] = [];

    for (const token of tokens) {
      const clean = token.toLowerCase();
      // Check if already in candidates
      if (candidates.some((c) => c.normalized === clean)) {
        continue;
      }
      newItems.push({
        address: token,
        normalized: clean,
        source_file: "Manual Entry",
        location: "User Added",
        all_sources: [{ file: "Manual Entry", location: "User Added" }],
        occurrences: 1,
      });
    }

    if (newItems.length === 0) {
      setManualAddError("Address is already present in the list or invalid.");
      return;
    }

    setCandidates((prev) => [...newItems, ...prev]);
    setSelectedCandidateAddresses((prev) => {
      const next = new Set(prev);
      for (const item of newItems) {
        next.add(item.address);
      }
      return next;
    });
    setManualAddressInput("");
  };

  // Transfer actions
  const getActiveAddresses = () => {
    return candidates
      .filter((c) => selectedCandidateAddresses.has(c.address))
      .map((c) => c.address);
  };

  const handleTransferToManual = () => {
    const toSend = getActiveAddresses();
    if (toSend.length > 0) {
      onAppendToManualInput(toSend);
    }
  };

  const handleProceedToVerification = () => {
    const toSend = getActiveAddresses();
    if (toSend.length > 0) {
      onAnalyzeAddresses(toSend, smtpEnabled);
    }
  };

  const activeAddresses = getActiveAddresses();

  return (
    <div className="space-y-6">
      {/* 1. Drag & Drop File Zone */}
      <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
        <div className="border-b border-border-subtle bg-surface-elevated/40 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Upload Documents for Email Extraction
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Extract candidate emails from text, CSV, PDF, modern Word (.docx), and .eml files.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                Up to {MAX_FILES} files (max 5 MB each)
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
              isDragOver
                ? "border-brand-400 bg-brand-500/10 dark:bg-brand-500/5"
                : "border-border-default hover:border-brand-400/50 bg-surface-primary/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="region"
            aria-label="File upload dropzone"
          >
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              multiple
              accept=".txt,.csv,.pdf,.docx,.eml"
              onChange={handleFileInputChange}
              className="sr-only"
              disabled={isExtracting}
            />

            <div className="flex flex-col items-center text-center space-y-3">
              <div
                className={`p-3 rounded-full ${
                  isDragOver
                    ? "bg-brand-500/20 text-brand-400"
                    : "bg-surface-elevated text-text-secondary"
                }`}
              >
                <UploadCloud className="h-8 w-8" aria-hidden="true" />
              </div>

              <div>
                <p className="text-sm font-medium text-text-primary">
                  <span className="text-brand-400 font-semibold underline underline-offset-2">
                    Browse files
                  </span>{" "}
                  or drag and drop them here
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Supported formats:{" "}
                  <span className="font-mono text-text-secondary">.txt, .csv, .pdf, .docx, .eml</span>
                </p>
              </div>

              {/* Scanned PDF notice per requirement */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-elevated text-[11px] text-text-muted border border-border-subtle max-w-lg">
                <Info className="h-3 w-3 shrink-0 text-amber-500/80" />
                <span>
                  Searchable text extracted directly. Scanned-image PDFs require conversion to searchable text first (OCR not supported).
                </span>
              </div>
            </div>
          </div>

          {/* Validation Errors & Notices */}
          {fileValidationErrors.length > 0 && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-1.5 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>File Selection Issues</span>
              </div>
              <ul className="list-disc pl-5 space-y-1">
                {fileValidationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {generalError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">Extraction Failed</p>
                <p>{generalError}</p>
              </div>
            </div>
          )}

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="font-medium text-text-secondary">
                  Ready to process ({selectedFiles.length} / {MAX_FILES} files):
                </span>
                <button
                  type="button"
                  onClick={handleClearSelectedFiles}
                  disabled={isExtracting}
                  className="text-rose-400 hover:text-rose-300 text-xs transition-colors cursor-pointer"
                >
                  Clear all files
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border-subtle bg-surface-primary text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-brand-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-text-muted font-mono">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(idx);
                      }}
                      disabled={isExtracting}
                      className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-surface-elevated transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Extract Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleStartExtraction}
                  disabled={isExtracting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Extracting Candidates...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>Extract Emails from {selectedFiles.length} {selectedFiles.length === 1 ? "File" : "Files"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Reviewable List of Extracted Candidates */}
      {(extractionResult !== null || candidates.length > 0) && (
        <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden animate-in fade-in duration-200">
          {/* Header & Extraction Counters */}
          <div className="border-b border-border-subtle bg-surface-elevated/40 px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-text-primary">
                    Review Extracted Candidate Addresses
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                    {candidates.length} unique
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">
                  Review and prune candidate addresses before sending them to the Mailora verification engine.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearCandidates}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-surface-elevated rounded-lg border border-border-subtle transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear List</span>
                </button>
              </div>
            </div>

            {/* Summary Statistics Pill Bar */}
            {extractionResult && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-primary border border-border-subtle text-text-secondary">
                  <span className="font-semibold text-text-primary">{extractionResult.total_detected}</span>
                  <span>candidates detected</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-primary border border-border-subtle text-text-secondary">
                  <span className="font-semibold text-text-primary">{extractionResult.unique_count}</span>
                  <span>unique addresses</span>
                </div>
                {extractionResult.duplicates_removed > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <span className="font-semibold">{extractionResult.duplicates_removed}</span>
                    <span>duplicates removed</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-primary border border-border-subtle text-text-secondary">
                  <span>Processed {extractionResult.files.length} {extractionResult.files.length === 1 ? "file" : "files"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Per-File Reports & Parsing Warnings */}
          {extractionResult && extractionResult.warnings && extractionResult.warnings.length > 0 && (
            <div className="border-b border-border-subtle bg-amber-500/10 px-5 py-3">
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Document Parsing Warnings:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {extractionResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* File Status Reports breakdown */}
          {extractionResult && (
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-primary/30">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                Processed Files Summary
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {extractionResult.files.map((rep: ExtractionFileReport, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-md bg-surface-primary border border-border-subtle text-xs"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {rep.status === "success" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      )}
                      {rep.status === "warning" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      )}
                      {rep.status === "error" && (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="truncate text-text-primary font-medium" title={rep.filename}>
                        {rep.filename}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-text-muted shrink-0 pl-2">
                      {rep.candidates_found} found
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Manual Add Form */}
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-primary/60">
            <form onSubmit={handleAddManualAddress} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <label htmlFor={manualAddId} className="sr-only">
                Add address to extracted list
              </label>
              <div className="relative flex-1">
                <input
                  id={manualAddId}
                  type="text"
                  value={manualAddressInput}
                  onChange={(e) => {
                    setManualAddressInput(e.target.value);
                    if (manualAddError) setManualAddError(null);
                  }}
                  placeholder="Add manual address to list (e.g., extra@example.com)..."
                  className="w-full rounded-md border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={!manualAddressInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-400/50 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Address</span>
              </button>
            </form>

            {manualAddError && (
              <p className="text-[11px] text-rose-400 mt-1.5">{manualAddError}</p>
            )}
          </div>

          {/* Candidates Table */}
          <div className="p-5 space-y-4">
            {candidates.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-xs space-y-1">
                <AlertCircle className="h-6 w-6 mx-auto text-text-muted/60 mb-2" />
                <p className="font-medium text-text-secondary">No email addresses found</p>
                <p>The uploaded documents contained no text matching standard email patterns.</p>
              </div>
            ) : (
              <>
                {/* Table Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCandidates}
                      className="text-text-muted hover:text-text-primary underline cursor-pointer"
                    >
                      Select all ({candidates.length})
                    </button>
                    <span className="text-border-subtle">•</span>
                    <button
                      type="button"
                      onClick={deselectAllCandidates}
                      className="text-text-muted hover:text-text-primary underline cursor-pointer"
                    >
                      Deselect all
                    </button>
                  </div>

                  <span className="font-mono text-text-muted">
                    {selectedCandidateAddresses.size} of {candidates.length} selected for verification
                  </span>
                </div>

                {/* Candidates Scroll Container */}
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle bg-surface-primary">
                  {candidates.map((cand) => {
                    const isSelected = selectedCandidateAddresses.has(cand.address);
                    return (
                      <div
                        key={cand.address}
                        className={`flex items-center justify-between px-3 py-2.5 hover:bg-surface-elevated/50 transition-colors text-xs ${
                          isSelected ? "bg-surface-elevated/30" : "opacity-75"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCandidate(cand.address)}
                            className="h-3.5 w-3.5 rounded border-border-default text-brand-500 focus:ring-brand-400 cursor-pointer"
                            aria-label={`Select ${cand.address}`}
                          />

                          <div className="min-w-0">
                            <span className="font-mono text-text-primary font-medium block truncate">
                              {cand.address}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
                              <span className="truncate max-w-[200px]" title={`${cand.source_file} (${cand.location})`}>
                                {cand.source_file}: {cand.location}
                              </span>
                              {cand.occurrences > 1 && (
                                <span className="px-1.5 py-0.2 rounded bg-surface-elevated text-text-secondary border border-border-subtle shrink-0">
                                  {cand.occurrences}x in batch
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCandidate(cand.address)}
                          className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-surface-elevated transition-colors cursor-pointer shrink-0 ml-2"
                          title="Remove address"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Final Confirmation & Workflow Launch Bar */}
                <div className="pt-3 border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    {/* SMTP Toggle */}
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={smtpEnabled}
                        onChange={(e) => setSmtpEnabled(e.target.checked)}
                        disabled={isLoadingAnalysis}
                        className="h-3.5 w-3.5 rounded border-border-default text-brand-500 focus:ring-brand-400 cursor-pointer"
                      />
                      <span>Enable SMTP Probing</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleTransferToManual}
                      disabled={activeAddresses.length === 0 || isLoadingAnalysis}
                      className="text-xs text-brand-400 hover:text-brand-300 underline cursor-pointer disabled:opacity-50 disabled:no-underline"
                      title="Append selected addresses to the manual textarea"
                    >
                      Copy to Manual Input Box
                    </button>
                  </div>

                  {/* Submit to Real Verification Engine */}
                  <button
                    type="button"
                    onClick={handleProceedToVerification}
                    disabled={activeAddresses.length === 0 || isLoadingAnalysis}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>Verify {activeAddresses.length} Addresses with Mailora</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
