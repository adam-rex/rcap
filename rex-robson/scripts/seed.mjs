#!/usr/bin/env node
/**
 * Seeds organisations, contacts, and deals with sample data.
 *
 * Requires a service role key (RLS only allows authenticated; service role bypasses RLS).
 * Accepts SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (prefer the non-public name).
 * Loads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL from .env.local or .env.
 *
 * Usage: pnpm db:seed  |  npm run db:seed
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFiles() {
  const root = resolve(process.cwd());
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadEnvFiles();

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRole =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
  "";

if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and/or a service role key.\n" +
      "Set SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
      "Never use NEXT_PUBLIC_ for the service role in real apps — it is exposed to the browser.",
  );
  process.exit(1);
}

if (
  serviceRole &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
) {
  console.warn(
    "Using NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY. Rename to SUPABASE_SERVICE_ROLE_KEY so the key is not bundled for the client.",
  );
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** PostgREST requires a filter on delete; this matches every real UUID row. */
const DUMMY = "00000000-0000-0000-0000-000000000000";

async function clearTables() {
  const { error: e1 } = await supabase
    .from("contacts")
    .delete()
    .neq("id", DUMMY);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("deals").delete().neq("id", DUMMY);
  if (e2) throw e2;
  const { error: e3 } = await supabase
    .from("organisations")
    .delete()
    .neq("id", DUMMY);
  if (e3) throw e3;
}

const ORG_IDS = {
  acme: "a1000000-0000-4000-8000-000000000001",
  northwind: "a1000000-0000-4000-8000-000000000002",
  summit: "a1000000-0000-4000-8000-000000000003",
};

const organisations = [
  {
    id: ORG_IDS.acme,
    name: "Acme Capital Partners",
    type: "fund",
    description: "Series A–C growth fund focused on B2B SaaS and fintech.",
  },
  {
    id: ORG_IDS.northwind,
    name: "Northwind Holdings",
    type: "family_office",
    description: "Direct co-investments alongside lead sponsors in North America.",
  },
  {
    id: ORG_IDS.summit,
    name: "Summit Ridge Advisors",
    type: "advisor",
    description: "M&A advisory and capital placement for middle-market industrials.",
  },
];

const contacts = [
  {
    name: "Jordan Lee",
    organisation_id: ORG_IDS.acme,
    role: "Principal",
    deal_types: ["growth_equity", "venture"],
    min_deal_size: 5_000_000,
    max_deal_size: 40_000_000,
    sectors: ["saas", "fintech"],
    geography: "United States",
    relationship_score: 0.82,
    last_contact_date: "2026-03-18",
    notes:
      "Warm intro via portfolio CEO. Interested in vertical SaaS with strong net retention.",
    source: "conference",
  },
  {
    name: "Priya Sharma",
    organisation_id: ORG_IDS.acme,
    role: "Associate",
    deal_types: ["venture"],
    min_deal_size: 2_000_000,
    max_deal_size: 15_000_000,
    sectors: ["healthcare_it", "saas"],
    geography: "US / Canada",
    relationship_score: 0.64,
    last_contact_date: "2026-02-02",
    notes: "Follow up on data room for the logistics automation deal.",
    source: "linkedin",
  },
  {
    name: "Marcus Webb",
    organisation_id: ORG_IDS.northwind,
    role: "Managing Director",
    deal_types: ["co_invest", "secondaries"],
    min_deal_size: 10_000_000,
    max_deal_size: 75_000_000,
    sectors: ["industrials", "business_services"],
    geography: "North America",
    relationship_score: 0.91,
    last_contact_date: "2026-04-01",
    notes: "Prefers control or significant minority with board rights.",
    source: "referral",
  },
  {
    name: "Elena Vasquez",
    organisation_id: ORG_IDS.summit,
    role: "Director",
    deal_types: ["m_and_a", "private_placement"],
    min_deal_size: null,
    max_deal_size: null,
    sectors: ["industrials", "logistics"],
    geography: "US Midwest",
    relationship_score: 0.77,
    last_contact_date: "2026-03-28",
    notes: "Running sell-side for two founder-led manufacturers; open to strategic buyers.",
    source: "event",
  },
];

const deals = [
  {
    title: "Project Atlas — B2B payments platform",
    size: 28_000_000,
    sector: "fintech",
    structure: "Series B preferred",
    status: "diligence",
    notes: "Strong unit economics; key risk is enterprise sales cycle length.",
  },
  {
    title: "Lumen Analytics recapitalization",
    size: 120_000_000,
    sector: "saas",
    structure: "majority_recap",
    status: "ioi",
    notes: "Sponsor exploring add-on acquisitions in marketing analytics.",
  },
  {
    title: "Harbor Freight co-invest (secondary)",
    size: 45_000_000,
    sector: "logistics",
    structure: "secondary",
    status: "passed",
    notes: "Passed on pricing; staying in touch for future stapled secondaries.",
  },
  {
    title: "Midwest Cold Storage platform",
    size: 85_000_000,
    sector: "industrials",
    structure: "buyout",
    status: "live",
    notes: "Roll-up of regional cold chain assets; environmental capex plan in data room.",
  },
];

async function main() {
  await clearTables();

  const { error: orgErr } = await supabase.from("organisations").insert(organisations);
  if (orgErr) throw orgErr;

  const { error: contactErr } = await supabase.from("contacts").insert(contacts);
  if (contactErr) throw contactErr;

  const { error: dealErr } = await supabase.from("deals").insert(deals);
  if (dealErr) throw dealErr;

  console.log(
    `Seeded ${organisations.length} organisations, ${contacts.length} contacts, ${deals.length} deals.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
