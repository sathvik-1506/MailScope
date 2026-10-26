import { CheckCircle2, XCircle, HelpCircle, Layers } from "lucide-react";
import type { Verdict, DetailedAddressResult } from "../../types";

interface SummaryCardsProps {
  results: DetailedAddressResult[];
  activeFilter: Verdict | "all";
  onSelectFilter: (filter: Verdict | "all") => void;
}

export default function SummaryCards({
  results,
  activeFilter,
  onSelectFilter,
}: SummaryCardsProps) {
  const total = results.length;
  const delivered = results.filter((r) => r.verdict === "likely_delivered").length;
  const bounce = results.filter((r) => r.verdict === "likely_bounce").length;
  const unknown = results.filter((r) => r.verdict === "unknown").length;

  const cards = [
    {
      id: "all" as const,
      label: "Total Analyzed",
      count: total,
      pct: 100,
      icon: Layers,
      color: "border-border-default hover:border-brand-400/60",
      activeRing: "ring-2 ring-brand-400",
      accentText: "text-text-primary",
      iconBg: "bg-surface-elevated text-text-secondary",
    },
    {
      id: "likely_delivered" as const,
      label: "Likely Delivered",
      count: delivered,
      pct: total > 0 ? Math.round((delivered / total) * 100) : 0,
      icon: CheckCircle2,
      color: "border-delivered/30 hover:border-delivered/80",
      activeRing: "ring-2 ring-delivered",
      accentText: "text-delivered",
      iconBg: "bg-delivered/10 text-delivered",
    },
    {
      id: "likely_bounce" as const,
      label: "Likely Bounce",
      count: bounce,
      pct: total > 0 ? Math.round((bounce / total) * 100) : 0,
      icon: XCircle,
      color: "border-bounce/30 hover:border-bounce/80",
      activeRing: "ring-2 ring-bounce",
      accentText: "text-bounce",
      iconBg: "bg-bounce/10 text-bounce",
    },
    {
      id: "unknown" as const,
      label: "Unknown",
      count: unknown,
      pct: total > 0 ? Math.round((unknown / total) * 100) : 0,
      icon: HelpCircle,
      color: "border-unknown/30 hover:border-unknown/80",
      activeRing: "ring-2 ring-unknown",
      accentText: "text-unknown",
      iconBg: "bg-unknown/10 text-unknown",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => {
        const isActive = activeFilter === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectFilter(c.id)}
            className={`flex flex-col justify-between rounded-xl border bg-surface-secondary p-4 text-left transition-all duration-200 cursor-pointer ${
              c.color
            } ${isActive ? `${c.activeRing} bg-surface-elevated/70 shadow-card` : "hover:bg-surface-elevated/40"}`}
            aria-pressed={isActive}
            aria-label={`Filter by ${c.label} (${c.count} addresses)`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {c.label}
              </span>
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.iconBg}`}>
                <c.icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className={`text-2xl font-bold font-mono tracking-tight ${c.accentText}`}>
                {c.count}
              </span>
              {total > 0 && (
                <span className="text-xs font-mono text-text-muted">
                  {c.pct}%
                </span>
              )}
            </div>

            <div className="mt-2 text-[10px] text-text-muted uppercase tracking-wider">
              {isActive ? "Filtered" : "Click to filter"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
