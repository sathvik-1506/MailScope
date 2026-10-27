import { useState } from "react";
import { Menu, X, Settings } from "lucide-react";
import Logo from "./Logo";
import Button from "./Button";
import ThemeSwitcher from "./ThemeSwitcher";
import SettingsModal from "./SettingsModal";

/**
 * Sticky top navigation bar.
 *
 * - Desktop: Logo, nav links, ThemeSwitcher, Settings, CTA button.
 * - Mobile: hamburger toggle with ThemeSwitcher and Settings in mobile drawer.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle/60 bg-surface-primary/80 backdrop-blur-lg"
        aria-label="Primary navigation"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-12">
          {/* Logo */}
          <Logo />

          {/* Desktop links & Theme Controls */}
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              How It Works
            </a>
            <a href="#verdicts" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Verdicts
            </a>

            <div className="h-4 w-px bg-border-subtle" aria-hidden="true" />

            <ThemeSwitcher variant="segmented" />

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-md transition-colors cursor-pointer"
              aria-label="Open appearance and workspace settings"
              title="Appearance Settings"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>

            <Button to="/app/analyze" size="sm">Start Analyzing</Button>
          </div>

          {/* Mobile toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeSwitcher variant="segmented" />
            <button
              type="button"
              className="text-text-secondary hover:text-text-primary p-1 cursor-pointer"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="border-t border-border-subtle bg-surface-secondary px-5 pb-6 pt-4 md:hidden animate-in fade-in">
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                onClick={() => setOpen(false)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setOpen(false)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                How It Works
              </a>
              <a
                href="#verdicts"
                onClick={() => setOpen(false)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Verdicts
              </a>

              <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary py-1 cursor-pointer"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  <span>Appearance Settings</span>
                </button>
              </div>

              <Button to="/app/analyze" size="sm" className="mt-2 w-full">
                Start Analyzing
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Settings Modal triggered from Navbar */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
