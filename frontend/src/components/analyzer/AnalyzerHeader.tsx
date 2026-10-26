import { ArrowLeft, ShieldCheck, HelpCircle } from "lucide-react";
import Logo from "../Logo";
import Button from "../Button";
import Badge from "../Badge";

interface AnalyzerHeaderProps {
  onOpenHelp?: () => void;
}

export default function AnalyzerHeader({ onOpenHelp }: AnalyzerHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle/80 bg-surface-primary/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo & Workspace breadcrumb */}
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden h-5 w-px bg-border-subtle sm:block" aria-hidden="true" />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
              Workspace
            </span>
            <Badge color="neutral">Deliverability Intelligence</Badge>
          </div>
        </div>

        {/* Right: Actions and Return Home */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1 text-xs text-text-muted px-2.5 py-1 rounded bg-surface-elevated/40 border border-border-subtle">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
            <span>Zero Messages Sent</span>
          </div>

          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-md transition-colors cursor-pointer"
              title="Verification limitations & methodology"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Methodology</span>
            </button>
          )}

          <Button to="/" variant="ghost" size="sm" ariaLabel="Return to MailScope home page">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Home</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
