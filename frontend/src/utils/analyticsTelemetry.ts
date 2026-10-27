import type { DetailedAddressResult } from "../types";

export interface ProviderStat {
  provider: string;
  count: number;
  percentage: number;
  delivered: number;
  bounce: number;
  unknown: number;
}

export interface DomainStat {
  domain: string;
  count: number;
  percentage: number;
  delivered: number;
  bounce: number;
  unknown: number;
}

export interface DnsRoutingStats {
  hasMx: number;
  implicitMx: number;
  nxdomain: number;
  nullMx: number;
  inconclusive: number;
}

export interface SmtpCoverageStats {
  probed: number;
  skippedOrDisabled: number;
  unavailableOrBlocked: number;
  accepted: number;
  rejected: number;
  inconclusiveOrGreylisted: number;
}

export interface DataQualityStats {
  syntaxValidCount: number;
  syntaxInvalidCount: number;
  syntaxPassRate: number;
  uniqueAddressesCount: number;
  duplicateCount: number;
  duplicateRate: number;
  fixtureCount: number;
  fixtureRate: number;
}

export interface ActivityTimePoint {
  id: string;
  timestamp: string;
  formattedTime: string;
  total: number;
  delivered: number;
  bounce: number;
  unknown: number;
  runTitle: string;
}

/**
 * Infers email service provider from recipient domain or DNS MX evidence.
 * For custom or corporate domains without specific MX infrastructure evidence,
 * conservatively classifies the provider as "Custom / Unknown Provider".
 *
 * NOTE: Provider classification reflects technical mail routing and does NOT
 * infer or estimate personal demographic characteristics (age, gender, ethnicity,
 * identity, location, etc.).
 */
export function inferEmailProvider(address: string, evidence?: string[]): string {
  if (!address || !address.includes("@")) {
    return "Invalid / Unknown";
  }

  const parts = address.toLowerCase().split("@");
  const domain = parts[1]?.trim() || "";

  // 1. Direct match on well-known consumer/enterprise domains
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "Google Workspace / Gmail";
  }
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain === "msn.com"
  ) {
    return "Microsoft 365 / Outlook";
  }
  if (
    domain === "yahoo.com" ||
    domain === "ymail.com" ||
    domain === "myyahoo.com" ||
    domain.endsWith(".yahoo.com")
  ) {
    return "Yahoo Mail";
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return "Apple iCloud";
  }
  if (domain === "proton.me" || domain === "protonmail.com") {
    return "Proton Mail";
  }
  if (domain === "zoho.com" || domain.endsWith(".zoho.com")) {
    return "Zoho Mail";
  }
  if (domain === "fastmail.com" || domain.endsWith(".fastmail.com")) {
    return "Fastmail";
  }
  if (domain === "aol.com") {
    return "AOL Mail";
  }

  // 2. Fall back to authoritative MX evidence if available in record
  if (evidence && Array.isArray(evidence)) {
    const evidenceStr = evidence.join(" ").toLowerCase();
    if (
      evidenceStr.includes("google.com") ||
      evidenceStr.includes("googlemail.com") ||
      evidenceStr.includes("aspmx.l.google.com")
    ) {
      return "Google Workspace / Gmail";
    }
    if (
      evidenceStr.includes("outlook.com") ||
      evidenceStr.includes("mail.protection.outlook.com")
    ) {
      return "Microsoft 365 / Outlook";
    }
    if (evidenceStr.includes("yahoodns.net") || evidenceStr.includes("yahoo.com")) {
      return "Yahoo Mail";
    }
    if (evidenceStr.includes("pphosted.com") || evidenceStr.includes("proofpoint.com")) {
      return "Proofpoint Protected";
    }
    if (evidenceStr.includes("mimecast.com")) {
      return "Mimecast Protected";
    }
  }

  // 3. Custom / Unknown Provider per strict data integrity requirement
  return "Custom / Unknown Provider";
}

/**
 * Calculates provider breakdown for a list of records.
 */
export function calculateProviderDistribution(records: DetailedAddressResult[]): ProviderStat[] {
  const map = new Map<string, { total: number; delivered: number; bounce: number; unknown: number }>();
  const total = records.length;
  if (total === 0) return [];

  for (const r of records) {
    const provider = inferEmailProvider(r.address, r.evidence);
    const existing = map.get(provider) || { total: 0, delivered: 0, bounce: 0, unknown: 0 };
    existing.total += 1;
    if (r.verdict === "likely_delivered") existing.delivered += 1;
    else if (r.verdict === "likely_bounce") existing.bounce += 1;
    else existing.unknown += 1;
    map.set(provider, existing);
  }

  return Array.from(map.entries())
    .map(([provider, stats]) => ({
      provider,
      count: stats.total,
      percentage: Number(((stats.total / total) * 100).toFixed(1)),
      delivered: stats.delivered,
      bounce: stats.bounce,
      unknown: stats.unknown,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculates top domains breakdown for a list of records.
 */
export function calculateDomainDistribution(
  records: DetailedAddressResult[],
  maxLimit = 8
): DomainStat[] {
  const map = new Map<string, { total: number; delivered: number; bounce: number; unknown: number }>();
  const total = records.length;
  if (total === 0) return [];

  for (const r of records) {
    const parts = r.address.split("@");
    const domain = parts.length > 1 ? parts[1].toLowerCase().trim() : "unknown-domain";
    const existing = map.get(domain) || { total: 0, delivered: 0, bounce: 0, unknown: 0 };
    existing.total += 1;
    if (r.verdict === "likely_delivered") existing.delivered += 1;
    else if (r.verdict === "likely_bounce") existing.bounce += 1;
    else existing.unknown += 1;
    map.set(domain, existing);
  }

  return Array.from(map.entries())
    .map(([domain, stats]) => ({
      domain,
      count: stats.total,
      percentage: Number(((stats.total / total) * 100).toFixed(1)),
      delivered: stats.delivered,
      bounce: stats.bounce,
      unknown: stats.unknown,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxLimit);
}

/**
 * Calculates authoritative DNS and routing outcomes across a dataset.
 */
export function calculateDnsRoutingStats(records: DetailedAddressResult[]): DnsRoutingStats {
  let hasMx = 0;
  let implicitMx = 0;
  let nxdomain = 0;
  let nullMx = 0;
  let inconclusive = 0;

  for (const r of records) {
    const code = r.reasonCode || "";
    const dnsStatus = r.dnsStatus;
    const routingStatus = r.routingStatus;

    if (code === "NULL_MX_REJECTED" || code === "NULL_MX") {
      nullMx += 1;
    } else if (code === "DOMAIN_NOT_FOUND" || dnsStatus === "failed") {
      nxdomain += 1;
    } else if (code === "IMPLICIT_MX_FALLBACK" || (routingStatus === "passed" && dnsStatus !== "passed")) {
      implicitMx += 1;
    } else if (dnsStatus === "passed") {
      hasMx += 1;
    } else if (dnsStatus === "inconclusive" || dnsStatus === "unavailable") {
      inconclusive += 1;
    }
  }

  return { hasMx, implicitMx, nxdomain, nullMx, inconclusive };
}

/**
 * Evaluates SMTP coverage and outcome classifications.
 * Note: Blocked port 25 or connection timeouts are explicitly classified as
 * unavailable/inconclusive, never falsified as bounces.
 */
export function calculateSmtpCoverageStats(records: DetailedAddressResult[]): SmtpCoverageStats {
  let probed = 0;
  let skippedOrDisabled = 0;
  let unavailableOrBlocked = 0;
  let accepted = 0;
  let rejected = 0;
  let inconclusiveOrGreylisted = 0;

  for (const r of records) {
    if (r.smtpStatus === "skipped") {
      skippedOrDisabled += 1;
    } else if (r.smtpStatus === "unavailable") {
      unavailableOrBlocked += 1;
    } else {
      probed += 1;
      if (r.smtpStatus === "passed") {
        accepted += 1;
      } else if (r.smtpStatus === "failed") {
        rejected += 1;
      } else if (r.smtpStatus === "inconclusive") {
        inconclusiveOrGreylisted += 1;
      }
    }
  }

  return {
    probed,
    skippedOrDisabled,
    unavailableOrBlocked,
    accepted,
    rejected,
    inconclusiveOrGreylisted,
  };
}

/**
 * Computes data hygiene and dataset quality metrics.
 */
export function calculateDataQualityStats(records: DetailedAddressResult[]): DataQualityStats {
  const total = records.length;
  if (total === 0) {
    return {
      syntaxValidCount: 0,
      syntaxInvalidCount: 0,
      syntaxPassRate: 0,
      uniqueAddressesCount: 0,
      duplicateCount: 0,
      duplicateRate: 0,
      fixtureCount: 0,
      fixtureRate: 0,
    };
  }

  let syntaxValidCount = 0;
  let fixtureCount = 0;
  const uniqueSet = new Set<string>();

  for (const r of records) {
    if (r.syntaxStatus === "passed") syntaxValidCount += 1;
    if (r.isFixture) fixtureCount += 1;
    uniqueSet.add(r.address.toLowerCase().trim());
  }

  const syntaxInvalidCount = total - syntaxValidCount;
  const uniqueAddressesCount = uniqueSet.size;
  const duplicateCount = Math.max(0, total - uniqueAddressesCount);

  return {
    syntaxValidCount,
    syntaxInvalidCount,
    syntaxPassRate: Number(((syntaxValidCount / total) * 100).toFixed(1)),
    uniqueAddressesCount,
    duplicateCount,
    duplicateRate: Number(((duplicateCount / total) * 100).toFixed(1)),
    fixtureCount,
    fixtureRate: Number(((fixtureCount / total) * 100).toFixed(1)),
  };
}
