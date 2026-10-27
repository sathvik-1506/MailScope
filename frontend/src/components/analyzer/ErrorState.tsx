import { AlertCircle, RefreshCw, XCircle } from "lucide-react";
import Button from "../Button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onDismiss?: () => void;
}

export default function ErrorState({
  message,
  onRetry,
  onDismiss,
}: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-surface-secondary p-8 text-center sm:p-12 shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm mb-4">
        <AlertCircle className="h-7 w-7" aria-hidden="true" />
      </div>

      <h3 className="text-base font-semibold text-text-primary">
        Backend Service Error
      </h3>

      <div className="mt-2 max-w-lg mx-auto space-y-2">
        <p className="text-sm text-text-secondary leading-relaxed font-mono text-xs bg-surface-primary/70 p-3 rounded-lg border border-border-subtle break-words">
          {message}
        </p>

        {/* Explicit clarity: This is NOT an email bounce verdict */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 text-left">
          <strong className="font-semibold block mb-0.5">Important:</strong>
          This is an application or network connectivity error, not an email-verification outcome. No addresses were marked as bounces due to this connection issue.
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Retry Analysis</span>
        </Button>

        {onDismiss && (
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <span>Dismiss</span>
          </Button>
        )}
      </div>
    </div>
  );
}
