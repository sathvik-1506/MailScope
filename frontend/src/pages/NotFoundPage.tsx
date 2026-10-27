import { Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, MailCheck, AlertTriangle } from "lucide-react";
import Logo from "../components/Logo";
import Button from "../components/Button";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { BRAND } from "../constants/brand";

const CURRENT_YEAR = new Date().getFullYear();

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-primary text-text-primary">
      {/* Simple Header */}
      <header className="border-b border-border-subtle bg-surface-secondary/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo />
          <ThemeSwitcher variant="segmented" />
        </div>
      </header>

      {/* Main 404 Centerpiece */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-sm">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
              HTTP 404 Error
            </span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
              Page Not Found
            </h1>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
              The page or resource you requested does not exist in {BRAND.name}. It may have moved or been renamed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button to="/app" size="md">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              <span>Workspace Overview</span>
            </Button>

            <Button to="/app/analyze" variant="secondary" size="md">
              <MailCheck className="h-4 w-4 mr-2" />
              <span>Analyze Emails</span>
            </Button>
          </div>

          <div className="pt-4 border-t border-border-subtle">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to landing page</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle py-6 text-center text-xs text-text-muted">
        &copy; {CURRENT_YEAR} {BRAND.name}. Explainable email deliverability intelligence.
      </footer>
    </div>
  );
}
