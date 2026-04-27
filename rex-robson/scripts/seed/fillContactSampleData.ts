#!/usr/bin/env npx tsx
/**
 * Backfill fake sample data for any missing contact fields (test utility).
 *
 * Usage:
 *   npx tsx scripts/seed/fillContactSampleData.ts
 *   npx tsx scripts/seed/fillContactSampleData.ts --seed 4242
 */

import { parseArgs } from "node:util";
import { faker } from "@faker-js/faker";
import { INTERNAL_CONTACT_OWNERS } from "@/lib/constants/internal-contact-owners";
import { createServiceSupabase } from "./env";

const CONTACT_TYPES = [
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
] as const;
const SECTORS = [
  "Fintech",
  "SaaS",
  "Healthcare",
  "AI",
  "Cybersecurity",
  "Climate",
  "Consumer",
  "Marketplace",
  "Real Estate",
  "Logistics",
  "Energy",
  "Education",
  "Media",
  "E-commerce",
  "Biotech",
] as const;
const DEAL_TYPE_SAMPLES = [
  "Venture",
  "Growth",
  "Buyout",
  "Credit",
  "Secondaries",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== raw?.trim()) {
    throw new Error(`Invalid ${flag}: expected a non-negative integer, got "${raw}".`);
  }
  return n;
}

type ContactRow = {
  id: string;
  contact_type: string | null;
  sector: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  geography: string | null;
  notes: string | null;
  deal_types: string[] | null;
  sectors: string[] | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  last_contact_date: string | null;
  source: string | null;
  internal_owner: string | null;
};

async function main(): Promise<void> {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        seed: { type: "string" },
      },
      strict: true,
    });

    const fakerSeed =
      values.seed !== undefined ? parsePositiveInt(values.seed, "--seed") : undefined;
    if (fakerSeed !== undefined) faker.seed(fakerSeed);

    const supabase = createServiceSupabase();

    const pageSize = 500;
    let page = 0;
    let updated = 0;
    let seen = 0;

    for (;;) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id,contact_type,sector,phone,email,role,geography,notes,deal_types,sectors,min_deal_size,max_deal_size,last_contact_date,source,internal_owner",
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = (data ?? []) as ContactRow[];
      if (rows.length === 0) break;

      seen += rows.length;

      for (const r of rows) {
        const patch: Record<string, unknown> = {};

        if (isBlank(r.contact_type)) {
          patch.contact_type = pick(CONTACT_TYPES);
        }
        let sectorVal = r.sector?.trim() ?? "";
        if (isBlank(r.sector)) {
          sectorVal = pick(SECTORS);
          patch.sector = sectorVal;
        }
        if (isBlank(r.phone)) {
          patch.phone = faker.phone.number().slice(0, 40);
        }
        if (isBlank(r.email)) {
          patch.email = faker.internet.email().slice(0, 320);
        }
        if (isBlank(r.role)) {
          patch.role = faker.person.jobTitle().slice(0, 300);
        }
        if (isBlank(r.geography)) {
          patch.geography = `${faker.location.city()}, ${faker.location.country()}`.slice(
            0,
            500,
          );
        }
        if (isBlank(r.notes)) {
          patch.notes = faker.lorem.sentences({ min: 1, max: 2 }).slice(0, 8000);
        }
        if (isBlank(r.deal_types)) {
          const n = 1 + Math.floor(Math.random() * 3);
          const picks = new Set<string>();
          while (picks.size < n) picks.add(pick(DEAL_TYPE_SAMPLES));
          patch.deal_types = Array.from(picks);
        }
        if (isBlank(r.sectors)) {
          const primary = sectorVal || pick(SECTORS);
          const extra = Math.random() > 0.5 ? pick(SECTORS) : null;
          patch.sectors = extra && extra !== primary ? [primary, extra] : [primary];
        }
        if (r.min_deal_size == null && r.max_deal_size == null) {
          const lo = faker.number.int({ min: 1, max: 20 }) * 1_000_000;
          const hi = lo + faker.number.int({ min: 5, max: 40 }) * 1_000_000;
          patch.min_deal_size = lo;
          patch.max_deal_size = hi;
        } else if (r.min_deal_size == null) {
          patch.min_deal_size = faker.number.int({ min: 1, max: 10 }) * 1_000_000;
        } else if (r.max_deal_size == null) {
          patch.max_deal_size = Number(r.min_deal_size) + faker.number.int({ min: 5, max: 30 }) * 1_000_000;
        }
        if (isBlank(r.last_contact_date)) {
          patch.last_contact_date = faker.date
            .recent({ days: 120 })
            .toISOString()
            .slice(0, 10);
        }
        if (isBlank(r.source)) {
          patch.source = "sample_seed";
        }
        if (isBlank(r.internal_owner)) {
          patch.internal_owner = pick(INTERNAL_CONTACT_OWNERS);
        }

        if (Object.keys(patch).length === 0) continue;

        const { error: upErr } = await supabase
          .from("contacts")
          .update(patch)
          .eq("id", r.id);
        if (upErr) throw upErr;
        updated += 1;
      }

      page += 1;
    }

    console.log(
      `fillContactSampleData: scanned ${seen} contacts, updated ${updated} rows (filled missing fields only).`,
    );
  } catch (e) {
    console.error(
      "fillContactSampleData failed:",
      e instanceof Error ? e.message : e,
    );
    if (typeof e === "object" && e) {
      try {
        console.error(JSON.stringify(e, null, 2));
      } catch {
        /* ignore */
      }
    }
    process.exitCode = 1;
  }
}

void main();
