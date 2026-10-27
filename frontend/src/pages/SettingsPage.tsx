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
} from "lucide-react";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";
import { BRAND } from "../constants/brand";

export default function SettingsPage() {
  const { theme, resolvedTheme } = useTheme();

  // Verification preferences stored in local component state
  const [defaultSmtp, setDefaultSmtp] = useState(false);
  const [autoExport, setAutoExport] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header */}
      <div className="border-b border-border-subtle pb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Preferences & Policies
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-text-secondary max-w-2xl">
          Configure application appearance, verification defaults, and inspect privacy guarantees.
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
                Select your preferred color theme or match your operating system appearance.
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
                Active setting: <strong className="font-mono text-text-primary capitalize">{theme}</strong> mode
              </span>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              Resolved: <strong className="capitalize">{resolvedTheme}</strong> theme
            </span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 2: Verification Engine Defaults                                   */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Sliders className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Analysis Defaults
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Default behavior for new email batches in the analyzer.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {/* SMTP Probing Default Toggle */}
            <div className="flex items-start justify-between gap-4 py-2">
              <div>
                <label htmlFor="default-smtp-toggle" className="text-sm font-medium text-text-primary block cursor-pointer">
                  Default SMTP Probing
                </label>
                <p className="text-xs text-text-muted mt-0.5 max-w-lg">
                  When enabled, new batch submissions default to checking mailbox existence via SMTP handshake. Keep disabled if testing corporate networks behind aggressive firewalls.
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
            <div className="flex items-start justify-between gap-4 py-2 border-t border-border-subtle">
              <div>
                <label htmlFor="auto-export-toggle" className="text-sm font-medium text-text-primary block cursor-pointer">
                  Auto-Prompt CSV Download
                </label>
                <p className="text-xs text-text-muted mt-0.5 max-w-lg">
                  Automatically prompt to download sanitized CSV immediately upon batch completion.
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
        {/* Section 3: Privacy & Data Retention Guarantees                            */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Shield className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Privacy & Data Security Architecture
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Technical safeguards protecting your email address lists.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <EyeOff className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">Zero Persistence</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Submitted email addresses exist in server memory only for the duration of the analysis request. No databases or permanent disks log address values.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <Lock className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">Zero Messages Sent</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                SMTP probes stop after the recipient handshake (<code className="text-brand-400">RCPT TO</code>) and cleanly send <code className="text-brand-400">RSET</code> / <code className="text-brand-400">QUIT</code>. No message body is ever sent.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-primary p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand-400">
                <Cpu className="h-4 w-4" />
                <h3 className="text-xs font-semibold text-text-primary">CWE-1236 Sanitization</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                All generated export files automatically escape formula injection triggers (=, +, -, @) to safeguard your spreadsheet software.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Section 4: System Information                                             */}
        {/* ========================================================================= */}
        <section className="rounded-xl border border-border-default bg-surface-secondary p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
            <Server className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Engine & Standards
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Technical specifications and compliance standards.
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
        </section>
      </div>
    </div>
  );
}
