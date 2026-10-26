import type { DetailedAddressResult } from "../types";
import { analyzeAddresses } from "./api";

/**
 * Standard RFC 2606 / RFC 6761 reserved domain test sample batch.
 * Guarantees no real email servers are contacted.
 */
export const SAMPLE_INPUT_BATCH = [
  "contact@example.com",
  "invalid..syntax@@example.net",
  "support@nonexistent-domain.invalid",
  "team@greylisting-host.test",
  "press@smtp-timeout.example.org",
  "inquiries@catchall-host.example.net",
].join("\n");

/**
 * Isolated fixture data for visual UI development and verification.
 * Clearly marked as fixtures to prevent confusion with real deliverability findings.
 */
export const FIXTURE_RESULTS: DetailedAddressResult[] = [
  {
    id: "fix-1",
    address: "contact@example.com",
    verdict: "likely_delivered",
    confidence: 0.88,
    reason: "Valid RFC 5321 syntax; authoritative MX records found; SMTP recipient accepted.",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c1-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "passed",
        detail: "Standard local-part and domain conforms to specification.",
        latencyMs: 1,
      },
      {
        id: "c1-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "passed",
        detail: "Domain 'example.com' exists with authoritative nameservers.",
        latencyMs: 38,
      },
      {
        id: "c1-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "passed",
        detail: "Found 2 MX targets: mx1.example.com (pri 10), mx2.example.com (pri 20).",
        latencyMs: 42,
      },
      {
        id: "c1-4",
        category: "smtp",
        name: "SMTP Handshake (RCPT TO probe)",
        status: "passed",
        detail: "Server responded with 250 2.1.5 Recipient OK. No email sent.",
        latencyMs: 120,
      },
    ],
    evidence: [
      "Address passes RFC 5321/5322 syntax validation.",
      "DNS: Authoritative MX records resolved (mx1.example.com).",
      "SMTP: Target mail server acknowledged recipient acceptance with code 250.",
    ],
    limitations: [
      "Mailbox existence cannot be guaranteed without full message transmission.",
      "Catch-all configurations or deferred bounces may still reject later delivery.",
    ],
  },
  {
    id: "fix-2",
    address: "invalid..syntax@@example.net",
    verdict: "likely_bounce",
    confidence: 0.99,
    reason: "RFC 5321 syntax violation: consecutive dots and multiple @ delimiters detected.",
    syntaxStatus: "failed",
    dnsStatus: "skipped",
    routingStatus: "skipped",
    smtpStatus: "skipped",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c2-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "failed",
        detail: "Local part contains consecutive periods (..) and duplicate @ delimiters.",
        latencyMs: 1,
      },
      {
        id: "c2-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "skipped",
        detail: "DNS query skipped due to earlier syntax failure.",
      },
      {
        id: "c2-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "skipped",
        detail: "Routing check skipped.",
      },
      {
        id: "c2-4",
        category: "smtp",
        name: "SMTP Handshake",
        status: "skipped",
        detail: "SMTP probe skipped for invalid address.",
      },
    ],
    evidence: [
      "Syntax: Failed RFC 5321 parsing (consecutive periods and redundant @ character).",
      "Immediate bounce: Mail transfer agents will reject the envelope syntax upon submission.",
    ],
    limitations: [
      "None. Syntactically invalid addresses cannot be routed by standards-compliant MTAs.",
    ],
  },
  {
    id: "fix-3",
    address: "support@nonexistent-domain.invalid",
    verdict: "likely_bounce",
    confidence: 0.95,
    reason: "Domain does not exist (DNS NXDOMAIN). No MX or fallback A/AAAA records found.",
    syntaxStatus: "passed",
    dnsStatus: "failed",
    routingStatus: "failed",
    smtpStatus: "skipped",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c3-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "passed",
        detail: "Address syntax conforms to standard RFC rules.",
        latencyMs: 1,
      },
      {
        id: "c3-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "failed",
        detail: "DNS resolution returned NXDOMAIN (Non-Existent Domain).",
        latencyMs: 65,
      },
      {
        id: "c3-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "failed",
        detail: "Zero MX records found; fallback A/AAAA host records also absent.",
        latencyMs: 15,
      },
      {
        id: "c3-4",
        category: "smtp",
        name: "SMTP Handshake",
        status: "skipped",
        detail: "No destination mail servers exist to connect to.",
      },
    ],
    evidence: [
      "DNS: Domain lookup resulted in NXDOMAIN status.",
      "Routing: No mail exchanger or fallback IP addresses found.",
    ],
    limitations: [
      "Recent domain registrations may take time to propagate across global DNS resolvers.",
    ],
  },
  {
    id: "fix-4",
    address: "team@greylisting-host.test",
    verdict: "unknown",
    confidence: 0.4,
    reason: "Server issued 451 greylisting challenge; verification is inconclusive without retry.",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "inconclusive",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c4-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "passed",
        detail: "Syntax validated.",
        latencyMs: 1,
      },
      {
        id: "c4-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "passed",
        detail: "Domain resolved successfully.",
        latencyMs: 44,
      },
      {
        id: "c4-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "passed",
        detail: "Found MX record: mail.greylisting-host.test.",
        latencyMs: 38,
      },
      {
        id: "c4-4",
        category: "smtp",
        name: "SMTP Handshake (RCPT TO probe)",
        status: "inconclusive",
        detail: "Server responded with 451 4.7.1 Greylisting in action, please come back later.",
        latencyMs: 210,
      },
    ],
    evidence: [
      "Syntax: Passed.",
      "DNS: Valid MX records located.",
      "SMTP: Temporary 4xx response code received (Greylisting defense active).",
    ],
    limitations: [
      "Greylisting is an anti-spam policy requiring repeated attempts over time.",
      "Single-probe verification cannot conclusively determine mailbox existence under greylisting.",
    ],
  },
  {
    id: "fix-5",
    address: "press@smtp-timeout.example.org",
    verdict: "unknown",
    confidence: 0.35,
    reason: "SMTP handshake timed out on port 25; connection blocked or rate-limited.",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "unavailable",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c5-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "passed",
        detail: "Syntax validated.",
        latencyMs: 1,
      },
      {
        id: "c5-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "passed",
        detail: "Domain exists with active zone.",
        latencyMs: 51,
      },
      {
        id: "c5-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "passed",
        detail: "Found 2 MX records.",
        latencyMs: 32,
      },
      {
        id: "c5-4",
        category: "smtp",
        name: "SMTP Handshake",
        status: "unavailable",
        detail: "TCP connection to port 25 timed out after 5000ms. Inconclusive.",
        latencyMs: 5002,
      },
    ],
    evidence: [
      "Syntax and DNS checks passed.",
      "SMTP server was unreachable on outbound port 25.",
    ],
    limitations: [
      "Cloud hosting providers and firewalls often block egress port 25.",
      "Inconclusive result does not imply the recipient is invalid.",
    ],
  },
  {
    id: "fix-6",
    address: "inquiries@catchall-host.example.net",
    verdict: "likely_delivered",
    confidence: 0.72,
    reason: "MX records valid and recipient accepted; host appears to be configured as a catch-all.",
    syntaxStatus: "passed",
    dnsStatus: "passed",
    routingStatus: "passed",
    smtpStatus: "passed",
    isFixture: true,
    analysedAt: new Date().toISOString(),
    checks: [
      {
        id: "c6-1",
        category: "syntax",
        name: "RFC 5321 / 5322 Syntax Format",
        status: "passed",
        detail: "Address format valid.",
        latencyMs: 1,
      },
      {
        id: "c6-2",
        category: "dns",
        name: "DNS Domain Resolution",
        status: "passed",
        detail: "Domain resolved with authoritative records.",
        latencyMs: 35,
      },
      {
        id: "c6-3",
        category: "routing",
        name: "Mail Exchanger (MX) Records",
        status: "passed",
        detail: "Found MX record: mx.catchall-host.example.net.",
        latencyMs: 29,
      },
      {
        id: "c6-4",
        category: "smtp",
        name: "SMTP Handshake (Catch-all probe)",
        status: "passed",
        detail: "Server accepted recipient. Note: server also accepted random test address.",
        latencyMs: 180,
      },
    ],
    evidence: [
      "Syntax and DNS routing records confirmed.",
      "SMTP recipient check returned 250 OK.",
      "Catch-all behavior detected: destination server accepts all inbound addresses.",
    ],
    limitations: [
      "Catch-all domains accept all recipient names during SMTP handshake.",
      "Undeliverable mail may be silently discarded or bounced post-handshake.",
    ],
  },
];

/**
 * Parses a raw multiline text input into an array of trimmed, non-empty email strings.
 */
export function parseInputAddresses(rawInput: string): string[] {
  return rawInput
    .split(/[\r\n,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Runs a simulated analysis of fixture data with progressive callback updates.
 * Used exclusively for frontend visualization and design validation.
 */
export async function runSimulatedAnalysis(
  addresses: string[],
  onProgress?: (percent: number, currentStep: string) => void
): Promise<DetailedAddressResult[]> {
  const steps = [
    { pct: 25, label: "Validating RFC syntax format..." },
    { pct: 55, label: "Querying DNS nameservers and MX routing records..." },
    { pct: 85, label: "Evaluating SMTP response codes and catch-all signals..." },
    { pct: 100, label: "Assembling Evidence Ledger and verdict classifications..." },
  ];

  for (const step of steps) {
    if (onProgress) {
      onProgress(step.pct, step.label);
    }
    // Realistic micro-delay for smooth UI progression
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // If user provided custom addresses, generate synthetic fixture items mapped to them,
  // clearly marked as fixtures. If empty or matching sample batch, use FIXTURE_RESULTS.
  if (addresses.length === 0) {
    return FIXTURE_RESULTS;
  }

  // Map input addresses to fixture models with explicit fixture flag
  return addresses.map((addr, idx) => {
    // Pick a template cycle
    const template = FIXTURE_RESULTS[idx % FIXTURE_RESULTS.length];
    return {
      ...template,
      id: `sim-${idx}-${Date.now()}`,
      address: addr,
      isFixture: true,
      analysedAt: new Date().toISOString(),
    };
  });
}

/**
 * Attempts real API analysis against the backend.
 * In this phase, the backend returns 501. This function captures that
 * and provides clear development diagnostic feedback.
 */
export async function executeLiveAnalysis(
  addresses: string[],
  smtpEnabled = false
): Promise<DetailedAddressResult[]> {
  return analyzeAddresses({
    addresses,
    smtp_enabled: smtpEnabled,
  });
}
