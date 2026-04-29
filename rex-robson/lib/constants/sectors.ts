/**
 * Canonical sector slugs for contacts (import script + filters).
 * Single-value `contacts.sector` and filter OR semantics use this set.
 */
export const WORKSPACE_SECTOR_SLUGS = [
  "fintech",
  "wealth_asset_management",
  "insurance_insurtech",
  "crypto_web3",
  "capital_markets",
  "saas_b2b",
  "consumer_tech",
  "enterprise_software",
  "cybersecurity",
  "ai_ml",
  "developer_tools",
  "data_analytics",
  "healthcare_services",
  "biotech_pharma",
  "medtech_devices",
  "digital_health",
  "consumer_brands",
  "ecommerce_marketplaces",
  "retail",
  "media_entertainment",
  "hospitality_travel",
  "real_estate_proptech",
  "construction_built_environment",
  "industrials_manufacturing",
  "logistics_supply_chain",
  "energy_climate",
  "agriculture_food",
  "professional_services",
  "education_edtech",
  "government_public_sector",
  "nonprofit_social_impact",
  "other",
] as const;

export type WorkspaceSectorSlug = (typeof WORKSPACE_SECTOR_SLUGS)[number];

export const WORKSPACE_SECTOR_SLUG_SET = new Set<string>(WORKSPACE_SECTOR_SLUGS);

/** Human-readable labels for filter chips and UI (values stay snake_case in API/DB). */
export const WORKSPACE_SECTOR_LABEL: Record<WorkspaceSectorSlug, string> = {
  fintech: "Fintech",
  wealth_asset_management: "Wealth & Asset Management",
  insurance_insurtech: "Insurance & Insurtech",
  crypto_web3: "Crypto / Web3",
  capital_markets: "Capital Markets",
  saas_b2b: "SaaS (B2B)",
  consumer_tech: "Consumer Tech",
  enterprise_software: "Enterprise Software",
  cybersecurity: "Cybersecurity",
  ai_ml: "AI & ML",
  developer_tools: "Developer Tools",
  data_analytics: "Data & Analytics",
  healthcare_services: "Healthcare Services",
  biotech_pharma: "Biotech & Pharma",
  medtech_devices: "Medtech & Devices",
  digital_health: "Digital Health",
  consumer_brands: "Consumer Brands",
  ecommerce_marketplaces: "E-commerce & Marketplaces",
  retail: "Retail",
  media_entertainment: "Media & Entertainment",
  hospitality_travel: "Hospitality & Travel",
  real_estate_proptech: "Real Estate & Proptech",
  construction_built_environment: "Construction & Built Environment",
  industrials_manufacturing: "Industrials & Manufacturing",
  logistics_supply_chain: "Logistics & Supply Chain",
  energy_climate: "Energy & Climate",
  agriculture_food: "Agriculture & Food",
  professional_services: "Professional Services",
  education_edtech: "Education & Edtech",
  government_public_sector: "Government & Public Sector",
  nonprofit_social_impact: "Nonprofit & Social Impact",
  other: "Other",
};

export function isWorkspaceSectorSlug(s: string): s is WorkspaceSectorSlug {
  return WORKSPACE_SECTOR_SLUG_SET.has(s);
}

export function parseSectorsQuery(raw: string | null): WorkspaceSectorSlug[] {
  if (raw == null || raw.trim() === "") return [];
  const out: WorkspaceSectorSlug[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase();
    if (t && isWorkspaceSectorSlug(t)) out.push(t);
  }
  return [...new Set(out)];
}

export function formatSectorsQuery(sectors: Iterable<string>): string {
  return [...new Set([...sectors].filter(isWorkspaceSectorSlug))].sort().join(",");
}
