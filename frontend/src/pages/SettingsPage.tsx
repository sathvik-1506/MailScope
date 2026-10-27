import { useState } from "react";
import {
  Sliders,
  Shield,
  Palette,
  CheckCircle2,
  Server,
  Lock,
  EyeOff,
  Cpu,
  Trash2,
  AlertCircle,
  Database,
  X,
} from "lucide-react";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";
import { useAnalysis } from "../context/AnalysisContext";
import { BRAND } from "../constants/brand";

export default function SettingsPage() {
  const { theme, resolvedTheme } = useTheme();
  const { batchHistory, clearHistory } = useAnalysis();

  // Verification preferences stored in local component state
  const [defaultSmtp, setDefaultSmtp] = useState(false);
  const [autoExport, setAutoExport] = useState(false);

  // Deletion confirmation state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  const handleClearHistory = async () => {
    setIsDeleting(true);
    try {
      await clearHistory();
      setClearedNotice(true);
      setShowClearConfirm(false);
      setTimeout(() => setClearedNotice(false), 5000);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="border-b border-border-subtle pb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Preferences & Data Lifecycle
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-text-secondary max-w-2xl">
          Configure application appearance, verification defaults, inspect technical specifications, and manage data retention.
        </p>
      </div>

      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* Section 1: Appearance Mode                                                */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Palette className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Appearance & Theme
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Select your preferred color theme or synchronize with your operating system appearance.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <ThemeSwitcher variant="cards" />
          </div>

          <div className="rounded-lg bg-surface-primary p-3.5 border border-border-subtle text-xs text-text-secondary flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                Active preference: <strong className="font-mono text-text-primary capitalize">{theme}</strong> mode
              </span>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              Resolved: <strong className="capitalize">{resolvedTheme}</strong> theme
            </span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 2: Verification Engine Defaults & SMTP Status                     */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Sliders className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Analysis Defaults & SMTP Configuration
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Configure default behaviors for batch verifications.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {/* SMTP Probing Default Toggle */}
            <div className="flex items-start justify-between gap-4 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <label htmlFor="default-smtp-toggle" className="text-sm font-medium text-text-primary block cursor-pointer">
                    Default SMTP Mailbox Probing
                  </label>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-500 border border-amber-500/20">
                    Disabled by Default
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-1 max-w-xl leading-relaxed">
                  SMTP handshake verification (<code className="text-brand-400">RCPT TO</code>) is intentionally <strong>disabled by default</strong> in both frontend and backend configurations. This prevents outbound port 25 blocking by cloud hosts, eliminates IP reputation risks from honeypots, and ensures fast evaluation times. Enable this option only when authoritative mailbox confirmation is required.
                </p>
              </div>
              <input
                id="default-smtp-toggle"
                type="checkbox"
                checked={defaultSmtp}
                onChange={(e) => setDefaultSmtp(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border-default bg-surface-primary text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Auto-export flag */}
            <div className="flex items-start justify-between gap-4 py-3 border-t border-border-subtle">
              <div>
                <label htmlFor="auto-export-toggle" className="text-sm font-medium text-text-primary block cursor-pointer">
                  Auto-Prompt CSV Download
                </label>
                <p className="text-xs text-text-muted mt-0.5 max-w-xl">
                  Automatically prompt to download sanitized CSV reports immediately upon batch completion.
                </p>
              </div>
              <input
                id="auto-export-toggle"
                type="checkbox"
                checked={autoExport}
                onChange={(e) => setAutoExport(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border-default bg-surface-primary text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 3: Privacy, Storage Tiers & Data Retention Policy                 */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Shield className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Storage Tiers & Privacy Architecture
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Exact explanation of where and how analysis records are stored.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <EyeOff className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">1. Ephemeral Backend (No Raw PII)</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                The verification engine processes emails statelessly in server memory. Raw email addresses and uploaded documents are <strong>never stored</strong> in the server database or written to disk.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <Database className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">2. Server Ledger (Metadata Only)</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Completed runs record only non-sensitive aggregate metadata (batch ID, timestamp, address count, verdict breakdown, top domain counts) with an automatic 30-day retention pruning TTL.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <Lock className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">3. Local Storage (Device-Isolated)</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Full granular verification evidence and address rows are stored strictly in your browser&apos;s local storage. Other users and server administrators cannot view your address lists.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 4: History & Data Retention Controls                              */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-500" />
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  History & Data Retention Controls
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Manage or permanently delete retained analysis records.
                </p>
              </div>
            </div>

            <span className="font-mono text-xs text-text-muted">
              {batchHistory.length} {batchHistory.length === 1 ? "run" : "runs"} recorded
            </span>
          </div>

          {clearedNotice && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>All retained history records have been permanently cleared from both your browser and the server ledger.</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Clear All Retained Analysis History
              </h3>
              <p className="text-xs text-text-muted mt-0.5 max-w-xl">
                Permanently purge all analysis runs, cached batch records, and technical composition telemetry across both local browser storage and the backend history database.
              </p>
            </div>

            <button
              type="button"
              disabled={batchHistory.length === 0}
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-500 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear History ({batchHistory.length})</span>
            </button>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 5: Engine Specifications & Technical Standards                     */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Server className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Engine & Technical Standards
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Technical limits, RFC specifications, and security standards enforced by the engine.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-text-muted block text-[10px] uppercase">Engine</span>
              <span className="text-text-primary font-semibold">{BRAND.name} Core</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-text-muted block text-[10px] uppercase">Batch Limit</span>
              <span className="text-text-primary font-semibold">100 addresses</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-text-muted block text-[10px] uppercase">DNS Standard</span>
              <span className="text-text-primary font-semibold">RFC 1035 / RFC 7505</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-text-muted block text-[10px] uppercase">Syntax Standard</span>
              <span className="text-text-primary font-semibold">RFC 5321 / RFC 5322</span>
            </div>
          </div>

          <div className="rounded-lg bg-surface-primary p-3 border border-border-subtle text-xs text-text-secondary flex items-start gap-2.5">
            <Cpu className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>CWE-1236 Sanitization:</strong> All generated CSV exports automatically prepend a single quote prefix to formula injection trigger characters (<code className="text-brand-400">=</code>, <code className="text-brand-400">+</code>, <code className="text-brand-400">-</code>, <code className="text-brand-400">@</code>, tab, and pipe) to ensure safe opening in Microsoft Excel and Google Sheets.
            </p>
          </div>
        </section>
      </div>

      {/* Confirmation Modal: Clear All History */}
      {showClearConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-primary p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-rose-500">
                <AlertCircle className="h-5 w-5" />
                <h3 id="clear-history-title" className="text-base font-bold text-text-primary">
                  Clear All History Records?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              This action will permanently delete all {batchHistory.length} recorded analysis runs from your local browser storage and the backend history database. This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleClearHistory}
                className="px-3.5 py-1.5 text-xs rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Clearing..." : "Yes, Clear All History"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
