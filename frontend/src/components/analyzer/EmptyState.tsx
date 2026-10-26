import { Inbox, Sparkles, Shield, Cpu, Globe } from "lucide-react";
import Button from "../Button";

interface EmptyStateProps {
  onLoadSample: () => void;
}

export default function EmptyState({ onLoadSample }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border-default bg-surface-secondary/50 p-8 text-center sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-400/20 bg-surface-elevated text-brand-400 shadow-sm mb-4">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </div>

      <h3 className="text-base font-semibold text-text-primary">
        No Batch Analysis Run Yet
      </h3>
      <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
        Paste a list of email addresses above or load our reserved RFC 2606 sample batch to visualize deliverability intelligence.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" size="sm" onClick={onLoadSample}>
          <Sparkles className="h-4 w-4 text-brand-400" aria-hidden="true" />
          <span>Load Sample Batch & Simulate</span>
        </Button>
      </div>

      {/* Feature pillars preview */}
      <div className="mt-10 grid grid-cols-1 gap-4 pt-8 border-t border-border-subtle/60 sm:grid-cols-3 max-w-xl mx-auto text-left">
        <div className="flex gap-2.5">
          <Cpu className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-medium text-text-primary">Syntax Integrity</h4>
            <p className="text-[11px] text-text-muted mt-0.5">Strict RFC 5321/5322 validation</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <Globe className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-medium text-text-primary">DNS & MX Routing</h4>
            <p className="text-[11px] text-text-muted mt-0.5">Live nameserver resolution</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <Shield className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-medium text-text-primary">Safe SMTP Probing</h4>
            <p className="text-[11px] text-text-muted mt-0.5">Opt-in handshake, zero emails sent</p>
          </div>
        </div>
      </div>
    </div>
  );
}
