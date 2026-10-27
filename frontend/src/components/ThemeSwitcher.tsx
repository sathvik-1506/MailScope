import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "../context/ThemeContext";

interface ThemeSwitcherProps {
  /** Optional layout style: "segmented" (default pill for navigation shell) or "cards" (for settings dialog) */
  variant?: "segmented" | "cards";
  className?: string;
}

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  icon: typeof Sun;
  description: string;
}[] = [
  {
    id: "light",
    label: "Light",
    icon: Sun,
    description: "Crisp, daylight workspace with high-contrast text and clean borders.",
  },
  {
    id: "dark",
    label: "Dark",
    icon: Moon,
    description: "Deep navy and violet theme designed for focused low-light intelligence work.",
  },
  {
    id: "system",
    label: "System",
    icon: Monitor,
    description: "Automatically matches your operating system appearance preference.",
  },
];

export default function ThemeSwitcher({
  variant = "segmented",
  className = "",
}: ThemeSwitcherProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // 1. Cards Variant (for Settings Dialog)
  if (variant === "cards") {
    return (
      <div
        role="radiogroup"
        aria-label="Appearance Theme Selection"
        className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}
      >
        {THEME_OPTIONS.map((opt) => {
          const isSelected = theme === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(opt.id)}
              className={`relative flex flex-col justify-between p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-brand-500 bg-brand-500/10 dark:bg-brand-500/15 ring-2 ring-brand-500 shadow-sm"
                  : "border-border-default bg-surface-primary hover:border-brand-400/50 hover:bg-surface-elevated/50"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-brand-500 text-white"
                        : "bg-surface-elevated text-text-secondary"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  {isSelected && (
                    <span className="flex h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                  )}
                </div>
                <div className="font-medium text-sm text-text-primary">
                  {opt.label}
                  {opt.id === "system" && (
                    <span className="ml-1.5 text-xs text-text-muted font-normal">
                      ({resolvedTheme})
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  {opt.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[11px] font-mono text-text-muted">
                {isSelected ? "Active mode" : "Select"}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // 2. Segmented Pill Variant (for Header / Navbar Shell)
  return (
    <div
      role="radiogroup"
      aria-label="Color theme switcher"
      className={`inline-flex items-center rounded-lg border border-border-subtle bg-surface-elevated/70 p-0.5 shadow-sm ${className}`}
    >
      {THEME_OPTIONS.map((opt) => {
        const isSelected = theme === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${opt.label} theme${
              opt.id === "system" ? ` (currently ${resolvedTheme})` : ""
            }`}
            title={`${opt.label} theme${
              opt.id === "system" ? ` (system currently ${resolvedTheme})` : ""
            }`}
            onClick={() => setTheme(opt.id)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 cursor-pointer select-none ${
              isSelected
                ? "bg-surface-primary text-text-primary shadow-sm font-semibold"
                : "text-text-muted hover:text-text-primary hover:bg-surface-primary/40"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
