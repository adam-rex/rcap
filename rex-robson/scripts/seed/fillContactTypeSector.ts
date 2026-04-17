#!/usr/bin/env npx tsx
/**
 * Backfill sample values for contacts missing contact_type/sector.
 *
 * Usage:
 *   npx tsx scripts/seed/fillContactTypeSector.ts
 *   npx tsx scripts/seed/fillContactTypeSector.ts --seed 123
 */

import { parseArgs } from "node:util";
import { faker } from "@faker-js/faker";
import { createServiceSupabase } from "./env";

const CONTACT_TYPES = ["Founder", "Investor", "Lender", "Other"] as const;
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

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== raw?.trim()) {
    throw new Error(`Invalid ${flag}: expected a non-negative integer, got "${raw}".`);
  }
  return n;
}

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
      values.seed !== undefined
        ? parsePositiveInt(values.seed, "--seed")
        : undefined;
    if (fakerSeed !== undefined) faker.seed(fakerSeed);

    const supabase = createServiceSupabase();

    const pageSize = 1000;
    let page = 0;
    let updated = 0;
    let seen = 0;

    for (;;) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("contacts")
        .select("id,contact_type,sector")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) break;

      seen += rows.length;

      const patch = rows
        .map((r) => {
          const contact_type =
            typeof r.contact_type === "string" && r.contact_type.trim() !== ""
              ? r.contact_type.trim()
              : pick(CONTACT_TYPES);
          const sector =
            typeof r.sector === "string" && r.sector.trim() !== ""
              ? r.sector.trim()
              : pick(SECTORS);
          const needsUpdate =
            (r.contact_type == null || String(r.contact_type).trim() === "") ||
            (r.sector == null || String(r.sector).trim() === "");
          return needsUpdate
            ? { id: String(r.id), contact_type, sector }
            : null;
        })
        .filter(Boolean) as Array<{
        id: string;
        contact_type: string;
        sector: string;
      }>;

      if (patch.length > 0) {
        const { error: upsertErr } = await supabase
          .from("contacts")
          .upsert(patch, { onConflict: "id" });
        if (upsertErr) throw upsertErr;
        updated += patch.length;
      }

      page += 1;
    }

    console.log(
      `fillContactTypeSector: scanned ${seen} contacts, updated ${updated} missing type/sector.`,
    );
  } catch (e) {
    console.error(
      "fillContactTypeSector failed:",
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

