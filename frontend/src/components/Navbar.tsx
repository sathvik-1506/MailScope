import { useState } from "react";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";
import Button from "./Button";

/**
 * Sticky top navigation bar.
 *
 * - Desktop: Logo, nav links, CTA button.
 * - Mobile: hamburger toggle for nav drawer.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle/60 bg-surface-primary/80 backdrop-blur-lg"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-12">
        {/* Logo */}
        <Logo />

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            How It Works
          </a>
          <a href="#verdicts" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Verdicts
          </a>
          <Button to="/app" size="sm">Start Analyzing</Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden text-text-secondary hover:text-text-primary p-1"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border-subtle bg-surface-secondary px-5 pb-6 pt-4 md:hidden">
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
            <Button to="/app" size="sm" className="mt-2 w-full">
              Start Analyzing
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
