import {
  AtSign,
  Globe,
  FileText,
  BarChart3,
  Upload,
  Search,
  ClipboardList,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Shield,
  Lock,
  EyeOff,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { Navbar, Footer, Section, SectionHeading, Button, Badge } from "../components";
import ProductPreview from "../components/ProductPreview";

/* ================================================================== */
/*  L A N D I N G   P A G E                                          */
/* ================================================================== */

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Spacer for fixed navbar */}
      <div className="h-16" aria-hidden="true" />

      <HeroSection />
      <PreviewSection />
      <FeaturesSection />
      <HowItWorksSection />
      <VerdictsSection />
      <EvidenceLedgerSection />
      <PrivacySection />
      <LimitationsSection />
      <FinalCTASection />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 + 2 + 3 + 4 + 5.  Hero                                          */
/* ------------------------------------------------------------------ */
function HeroSection() {
  return (
    <Section className="!pt-20 !pb-10 sm:!pt-28 sm:!pb-16">
      <div className="max-w-3xl">
        <Badge color="neutral" className="mb-6">
          Explainable Deliverability Intelligence
        </Badge>

        <h1 className="text-display font-bold leading-display tracking-tight">
          Know why an email
          <br className="hidden sm:block" />
          <span className="text-brand-400">&nbsp;will or won't&nbsp;</span>
          deliver
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
          Most validation tools return a green check or a red cross — with no
          explanation. MailScope analyzes syntax, DNS records, and optional SMTP
          signals, then shows you the evidence and its limitations so you can
          make informed decisions.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Button to="/app" size="lg">
            Start Analyzing <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button href="#how-it-works" variant="secondary" size="lg">
            Explore How It Works
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 6.  Product preview                                                 */
/* ------------------------------------------------------------------ */
function PreviewSection() {
  return (
    <Section surface="elevated" className="!py-14">
      <ProductPreview />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 7.  Features                                                        */
/* ------------------------------------------------------------------ */
const FEATURES = [
  {
    icon: AtSign,
    title: "Syntax Validation",
    desc: "RFC 5321 / 5322 parsing catches malformed addresses before they waste a send.",
  },
  {
    icon: Globe,
    title: "DNS / MX Analysis",
    desc: "Queries MX records with A/AAAA fallback. Non-existent domains surface immediately.",
  },
  {
    icon: FileText,
    title: "Evidence Explanations",
    desc: "Every verdict comes with a list of evidence items and known caveats — never a bare boolean.",
  },
  {
    icon: BarChart3,
    title: "Batch Reports",
    desc: "Analyze batches of addresses in a single request and review results in a structured table.",
  },
] as const;

function FeaturesSection() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Capabilities"
        title="What MailScope analyzes"
        subtitle="Four layers of deliverability evidence, each independently explained."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-lg border border-border-subtle bg-surface-secondary p-6 transition-all duration-200 hover:border-brand-400/30 hover:shadow-card"
          >
            <f.icon
              className="mb-4 h-6 w-6 text-brand-400 transition-transform duration-200 group-hover:scale-110"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <h3 className="text-h3 font-semibold mb-2">{f.title}</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{f.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 8.  How It Works (3 steps)                                          */
/* ------------------------------------------------------------------ */
const STEPS = [
  {
    num: "01",
    icon: Upload,
    title: "Submit addresses",
    desc: "Paste a batch of email addresses or upload a list. Choose whether to enable optional SMTP probing.",
  },
  {
    num: "02",
    icon: Search,
    title: "Multi-layer analysis",
    desc: "MailScope validates syntax, queries DNS for MX records, and (optionally) probes SMTP — without ever sending a message.",
  },
  {
    num: "03",
    icon: ClipboardList,
    title: "Review evidence",
    desc: "Each address receives a verdict with confidence, supporting evidence, and documented limitations.",
  },
] as const;

function HowItWorksSection() {
  return (
    <Section id="how-it-works" surface="elevated">
      <SectionHeading
        eyebrow="Workflow"
        title="Three steps to explainable results"
      />

      <div className="grid gap-8 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.num} className="relative pl-8">
            {/* Step number */}
            <span className="absolute left-0 top-0 text-xs font-mono font-bold text-brand-400/50">
              {s.num}
            </span>
            <s.icon className="mb-3 h-6 w-6 text-brand-400" strokeWidth={1.8} aria-hidden="true" />
            <h3 className="text-h3 font-semibold mb-2">{s.title}</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{s.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 9.  Verdicts                                                        */
/* ------------------------------------------------------------------ */
const VERDICTS = [
  {
    icon: CheckCircle2,
    label: "Likely Delivered",
    color: "delivered" as const,
    textColor: "text-delivered",
    desc: "Strong evidence that the address exists and can receive mail. MX records resolve, and (if SMTP was enabled) the server accepted the recipient.",
    caveat: "Catch-all servers may accept any address; delivery is still not guaranteed.",
  },
  {
    icon: XCircle,
    label: "Likely Bounce",
    color: "bounce" as const,
    textColor: "text-bounce",
    desc: "Strong evidence that the address is unreachable. The syntax is invalid, the domain doesn't exist, or the server explicitly rejected the recipient.",
    caveat: "Temporary DNS outages or misconfigurations could produce false negatives.",
  },
  {
    icon: HelpCircle,
    label: "Unknown",
    color: "unknown" as const,
    textColor: "text-unknown",
    desc: "Insufficient evidence for a confident verdict. DNS timed out, SMTP was blocked, or probing was disabled.",
    caveat: "This is not a failure — it is an honest acknowledgment of uncertainty.",
  },
] as const;

function VerdictsSection() {
  return (
    <Section id="verdicts">
      <SectionHeading
        eyebrow="Classifications"
        title="Three honest verdicts"
        subtitle="MailScope never claims certainty. Every result is probabilistic and every limitation is disclosed."
      />

      <div className="grid gap-6 sm:grid-cols-3">
        {VERDICTS.map((v) => (
          <div
            key={v.label}
            className="rounded-lg border border-border-subtle bg-surface-secondary p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <v.icon className={`h-5 w-5 ${v.textColor}`} aria-hidden="true" />
              <Badge color={v.color}>{v.label}</Badge>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary mb-4">
              {v.desc}
            </p>
            <p className="text-xs leading-relaxed text-text-muted italic">
              Caveat: {v.caveat}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 10.  Evidence Ledger showcase                                       */
/* ------------------------------------------------------------------ */
const LEDGER_ENTRIES = [
  { type: "syntax",  label: "Syntax",  detail: "Address passes RFC 5321/5322 syntax checks." },
  { type: "dns",     label: "DNS",     detail: "Found 2 MX record(s): mx1.corp.com, mx2.corp.com" },
  { type: "smtp",    label: "SMTP",    detail: "Verification disabled — not enabled for this request." },
  { type: "limit",   label: "Limitation", detail: "Mailbox existence unconfirmed without SMTP probing." },
];

function EvidenceLedgerSection() {
  return (
    <Section surface="elevated">
      <SectionHeading
        eyebrow="Transparency"
        title="The Evidence Ledger"
        subtitle="Every analysis produces a structured log of what was checked, what was found, and what remains unconfirmed."
      />

      <div className="max-w-2xl rounded-lg border border-border-default bg-surface-primary/60 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-elevated/40">
          <span className="text-xs text-text-muted font-mono">
            evidence ledger for user@corp.com
          </span>
        </div>
        <div className="divide-y divide-border-subtle">
          {LEDGER_ENTRIES.map((entry) => (
            <div key={entry.type} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 shrink-0 rounded bg-brand-400/10 px-1.5 py-0.5 text-xs font-mono font-medium text-brand-400">
                {entry.label}
              </span>
              <span className="text-sm text-text-secondary">{entry.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 11.  Privacy                                                        */
/* ------------------------------------------------------------------ */
const PRIVACY_ITEMS = [
  {
    icon: Shield,
    title: "No messages sent",
    desc: "SMTP verification never progresses past the RCPT TO handshake. No email content is ever generated or transmitted.",
  },
  {
    icon: Lock,
    title: "Stateless by default",
    desc: "Address data is not stored, logged, or cached beyond the lifetime of your request.",
  },
  {
    icon: EyeOff,
    title: "SMTP is opt-in",
    desc: "SMTP probing is disabled by default. You explicitly choose when to enable it, and blocked connections are treated as inconclusive.",
  },
];

function PrivacySection() {
  return (
    <Section id="privacy">
      <SectionHeading
        eyebrow="Responsibility"
        title="Privacy and responsible verification"
        subtitle="MailScope is designed to gather evidence without disrupting mail infrastructure or exposing recipient data."
      />

      <div className="grid gap-6 sm:grid-cols-3">
        {PRIVACY_ITEMS.map((item) => (
          <div key={item.title} className="flex gap-4">
            <item.icon
              className="mt-1 h-5 w-5 shrink-0 text-brand-400"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <div>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 12.  Limitations                                                    */
/* ------------------------------------------------------------------ */
function LimitationsSection() {
  return (
    <Section surface="elevated">
      <div className="rounded-lg border border-border-default bg-surface-primary/40 p-8 max-w-3xl">
        <div className="flex items-start gap-4">
          <AlertTriangle
            className="mt-1 h-6 w-6 shrink-0 text-unknown"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <div>
            <h2 className="text-h3 font-bold mb-3">Known limitations</h2>
            <ul className="space-y-2 text-sm leading-relaxed text-text-secondary">
              <li>
                <strong className="text-text-primary">Mailbox existence</strong> cannot be
                confirmed without delivering an actual message. SMTP RCPT TO is a probe, not
                proof.
              </li>
              <li>
                <strong className="text-text-primary">Catch-all domains</strong> accept any
                address during the SMTP handshake, producing false positives.
              </li>
              <li>
                <strong className="text-text-primary">Greylisting and rate limiting</strong>{" "}
                may cause SMTP probes to be temporarily rejected or delayed, leading to
                inconclusive results.
              </li>
              <li>
                <strong className="text-text-primary">DNS propagation</strong> is not
                instantaneous. Recently created or migrated domains may produce stale
                results for a short window.
              </li>
              <li>
                <strong className="text-text-primary">Network restrictions</strong> on
                outbound port 25 (common on cloud platforms) prevent SMTP probing entirely,
                making that signal unavailable.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 13.  Final CTA                                                      */
/* ------------------------------------------------------------------ */
function FinalCTASection() {
  return (
    <Section className="!py-20 text-center">
      <div className="mx-auto max-w-lg">
        <h2 className="text-h1 font-bold leading-h1 tracking-tight mb-4">
          Ready to see the evidence?
        </h2>
        <p className="text-text-secondary mb-8">
          Paste your first batch and get explainable deliverability verdicts in seconds.
        </p>
        <Button to="/app" size="lg">
          Start Analyzing <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </Section>
  );
}
