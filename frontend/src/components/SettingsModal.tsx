import { useEffect } from "react";
import { X, Sliders, Shield } from "lucide-react";
import ThemeSwitcher from "./ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border-default bg-surface-secondary shadow-elevated p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Sliders className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="settings-title" className="text-xl font-bold tracking-tight text-text-primary">
                Workspace Settings
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Customize workspace appearance and view privacy preferences.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label="Close settings dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-6 text-sm">
          {/* Theme Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-text-primary text-sm">Appearance Mode</h3>
                <p className="text-xs text-text-muted">
                  Choose how Mailora looks to you. Active preference:{" "}
                  <span className="font-mono text-text-primary font-medium capitalize">
                    {theme}
                    {theme === "system" && ` (${resolvedTheme})`}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-3">
              <ThemeSwitcher variant="cards" />
            </div>
          </div>

          {/* Privacy & Storage Guarantee */}
          <div className="rounded-xl border border-border-subtle bg-surface-primary/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <Shield className="h-4 w-4 text-brand-500" aria-hidden="true" />
              <span>Zero-Tracking Privacy Guarantee</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Theme preferences are stored locally in your browser’s <code className="font-mono text-[11px] bg-surface-elevated px-1 py-0.5 rounded">localStorage</code>. No analytics cookies or persistent user identifiers are transmitted or stored by the backend.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-8 pt-4 border-t border-border-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-elevated border border-border-default px-5 py-2 text-xs font-medium text-text-primary hover:bg-surface-card transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
