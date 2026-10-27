/**
 * Centralized brand configuration for Mailora.
 * Defines brand name, taglines, positioning statements, and metadata.
 */
export const BRAND = {
  name: "Mailora",
  tagline: "Every Address Has a Story. Discover the Signals.",
  positioning: "Explainable email deliverability intelligence, grounded in evidence.",
  description:
    "Explainable email deliverability intelligence, grounded in evidence. Analyze technical mail routing, DNS configurations, and recipient signals without ever sending messages.",
  shortDescription:
    "Explainable email deliverability intelligence grounded in evidence.",
  csvPrefix: "mailora_analysis",
  copyright: "Mailora. Built for transparency.",
} as const;

export type BrandConfig = typeof BRAND;
