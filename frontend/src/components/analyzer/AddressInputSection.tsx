import { useId } from "react";
import {
  Sparkles,
  Trash2,
  Play,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import Button from "../Button";
import { BRAND } from "../../constants/brand";
import { SAMPLE_INPUT_BATCH, parseInputAddresses } from "../../services/analyzerAdapter";

interface AddressInputSectionProps {
  input: string;
  onChangeInput: (val: string) => void;
  onAnalyze: (addresses: string[]) => void;
  isLoading: boolean;
  progressPercent: number;
  progressStep: string;
}

export default function AddressInputSection({
  input,
  onChangeInput,
  onAnalyze,
  isLoading,
  progressPercent,
  progressStep,
}: AddressInputSectionProps) {
  const textareaId = useId();

  const parsedAddresses = parseInputAddresses(input);
  const count = parsedAddresses.length;

  const handleClear = () => {
    if (isLoading) return;
    onChangeInput("");
  };

  const handleLoadSample = () => {
    if (isLoading) return;
    onChangeInput(SAMPLE_INPUT_BATCH);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Prevent duplicate submissions while request is in flight or input empty
    if (count === 0 || isLoading) return;
    onAnalyze(parsedAddresses);
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary shadow-card overflow-hidden">
      {/* Section Header */}
      <div className="border-b border-border-subtle bg-surface-elevated/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Email Address Batch Input
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Paste addresses separated by newlines, commas, or semicolons.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-brand-400/50 hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Populate input with reserved RFC 2606 sample domains"
            >
              <Sparkles className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
              <span>Load Sample Batch</span>
            </button>

            {input.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-primary px-3 py-1.5 text-xs font-medium text-rose-400/80 hover:text-rose-400 hover:border-rose-500/40 hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                title="Clear all address inputs"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5">
        {/* Textarea */}
        <div className="relative">
          <label htmlFor={textareaId} className="sr-only">
            Email addresses for deliverability analysis
          </label>
          <textarea
            id={textareaId}
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            disabled={isLoading}
            rows={7}
            placeholder={`e.g.\nalice@example.com\nsales@company.org\npress@domain.co.uk`}
            className="w-full rounded-lg border border-border-subtle bg-surface-primary p-4 font-mono text-sm leading-relaxed text-text-primary placeholder:text-text-muted/60 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60 resize-y"
          />

          {/* Floating counter badge */}
          <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-medium ${
                  count > 0 ? "text-brand-400" : "text-text-muted"
                }`}
              >
                {count} {count === 1 ? "address" : "addresses"} parsed
              </span>
              {count > 0 && (
                <span className="text-text-muted/60">• Blank lines ignored</span>
              )}
            </div>

            {count === 0 && (
              <span className="italic text-text-muted/70">
                Enter at least 1 address to analyze
              </span>
            )}
          </div>
        </div>

        {/* Configuration Options & Submission Bar */}
        <div className="mt-5 pt-4 border-t border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Full Multi-Stage Pipeline (Automatic)</span>
            </span>
            <span className="text-xs text-text-muted">
              Syntax, DNS/MX, and safe mailbox probing executed automatically
            </span>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className={count === 0 || isLoading ? "opacity-50 cursor-not-allowed" : ""}
              ariaLabel={`Submit email addresses to ${BRAND.name} backend verification engine`}
            >
              {isLoading ? (
                <>
                  <RotateCw className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                  <span>Analyzing Batch...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" aria-hidden="true" />
                  <span>
                    Analyze {count > 0 ? `${count} ${count === 1 ? "Address" : "Addresses"}` : "Batch"}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Verification Policy Indicator */}
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-primary/70 border border-border-subtle p-3 text-xs text-text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand-400 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="text-text-secondary">Verification Engine:</strong> Addresses are submitted directly to the {BRAND.name} backend. Full multi-stage verification (syntax validation, DNS/MX mail-routing checks, and safe recipient probing where supported by the hosting environment) is evaluated automatically without ever sending email.
          </p>
        </div>

        {/* Progress Bar (Visible during analysis) */}
        {isLoading && (
          <div className="mt-5 space-y-2 pt-4 border-t border-border-subtle">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-400 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
                </span>
                {progressStep || "Processing verification pipeline..."}
              </span>
              <span className="font-mono text-text-muted">{progressPercent}%</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-brand-400 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
