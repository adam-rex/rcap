#!/usr/bin/env npx tsx
/**
 * One-off: insert UK commercial lender contacts (type Lender) + organisations.
 *
 * Usage:
 *   npx tsx scripts/seed/importUkLendersMay2026.ts
 *   npx tsx scripts/seed/importUkLendersMay2026.ts --dry-run
 *   npx tsx scripts/seed/importUkLendersMay2026.ts --patch-geography  # set UK on this import batch
 *   npx tsx scripts/seed/importUkLendersMay2026.ts --patch-bl-notes   # expand BL → business loan in notes (this import batch)
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { parseArgs } from "node:util";
import { createServiceSupabase } from "./env";

const SOURCE_TAG = "uk_lenders_bulk_import_may2026";

type LenderRow = {
  institution: string;
  notes: string;
  /** Primary email when clearly given (full details still in notes). */
  email: string | null;
};

const LENDERS: LenderRow[] = [
  {
    institution: "Nationwide Corporate Finance",
    email: null,
    notes: `Secured Business Loan | £8k–£2m | 10% 2nd charge LTV | 0.80%–2% pm | 12–60 months | Homeowner/guarantor accepted | Min. turnover £50k pa | Minimum equity £120k`,
  },
  {
    institution: "Reward Finance",
    email: "Mark.Swindell@rewardcf.com",
    notes: `Secured Business Loan | £50k–£5m | 1.25%–1.60% pm | 3–12 months | Homeowner/guarantor accepted | Arrangement fee 2–4% | Contact: Mark.Swindell@rewardcf.com`,
  },
  {
    institution: "Market Finance",
    email: null,
    notes: `Selective Invoice Discounting | £100k–£2m | Up to 90% advance | No contract | Min. turnover £100k | No trading history requirement | Refuses: Contractors/JCT contracts`,
  },
  {
    institution: "Investec",
    email: null,
    notes: `CID/ID | Min. £250k | Up to 90% advance | No Scotland | Contact: Josh Owens`,
  },
  {
    institution: "Lloyds",
    email: null,
    notes: `Invoice Factoring/Discounting | £5k–£10m | Up to 90% advance | Min. 6 months trading | Min. turnover £50k`,
  },
  {
    institution: "Optimum Finance",
    email: "ihendry@optimumfinance.co.uk",
    notes: `Factoring, Discounting & CHOCS | £10k–£1.2m each | Up to 90% advance | Min. turnover £100k | Cannot do NI | Likes MBOs/MBIs, recruitment companies | Refuses: construction/groundwork/electrical contractors working to applications | Contact: ihendry@optimumfinance.co.uk`,
  },
  {
    institution: "Bibby",
    email: null,
    notes: `Forward Finance, Invoice Factoring & Invoice Discounting | £1k–£5m | Up to 90–100% advance | Min. 3 months term | UK-wide | Refuses: businesses invoicing in advance, B2C, sale or return`,
  },
  {
    institution: "Ultimate Finance",
    email: null,
    notes: `IF | £100k–£7m | Up to 95% advance | Min. 3 months | Min. turnover £500k | Contact: Adrian/Lucy`,
  },
  {
    institution: "Penny",
    email: null,
    notes: `SIF | £1–£100k | 95% advance rate | No contract | Contact: Adam Parker`,
  },
  {
    institution: "Fleximize",
    email: "leeandmarney@fleximize.com",
    notes: `Unsecured business loan | £10k–£250k | Monthly turnover x1.25 | 2%–3.50% pm | 3–42 months | 6 months trading | Min. turnover £100k | No Scotland/NI secured | No ERPs | Contact: leeandmarney@fleximize.com`,
  },
  {
    institution: "Credit4",
    email: null,
    notes: `Unsecured business loan | £30k–£150k | 5–50% annual turnover | 2% pm | 12–24 months | 6 months trading | Min. turnover £100k | Arrangement fee 4% | Also wants cashflow forecast + last 2x VAT returns

RCF | £15k–£30k | 5–50% turnover | 2.50% pm | 3–12 months | Same requirements as unsecured business loan above`,
  },
  {
    institution: "365 Business Finance",
    email: "Amy@365businessfinance.co.uk",
    notes: `MCA | £10k–£500k | 2x monthly card takings | Factor rate 1.2–1.27 | Min. card payments £10k pm | 6 months trading | Min. turnover £120k | Contact: Amy@365businessfinance.co.uk`,
  },
  {
    institution: "YouLend",
    email: null,
    notes: `MCA | £5k–£1m | 0.5–2x monthly turnover | Factor rate 1.15–1.29 | Up to 24 months | 6 months trading | Min. card payments £5k | Min. turnover £60k`,
  },
  {
    institution: "MaxCap",
    email: "sales@maxcap.co.uk",
    notes: `Unsecured business loan | £10k–£350k (loans >£100k) | 100–200% monthly turnover | 3%–5% pm | 6–12 months | 12 months trading | Min. turnover £180k | Open banking required | Contact: sales@maxcap.co.uk`,
  },
  {
    institution: "Little Business Loans",
    email: null,
    notes: `Unsecured business loan | £3k–£20k | 10% turnover | 2.50%–3.50% pm | 6–12 months | 12 months trading | Min. turnover £120k | No Scotland/NI | Refuses: recruitment, letting agents`,
  },
  {
    institution: "Swiftfund",
    email: null,
    notes: `Unsecured business loan | £10k–£100k | Factor rate 1.3–1.5 | 6–12 months | 12 months trading | Min. turnover £240k`,
  },
  {
    institution: "Swishfund",
    email: "justin.parr@swishfund.co.uk",
    notes: `Unsecured business loan (loans >£50k) | £10k–£500k | 10% annual turnover | 0.80%–2.33% pm | 3–24 months | 12 months trading | Min. turnover £100k | Open banking required | Contact: justin.parr@swishfund.co.uk`,
  },
  {
    institution: "Momenta",
    email: null,
    notes: `Unsecured business loan | £50k–£250k | 25% annual turnover | 12.5%–22% | 6–60 months | 12 months trading | Min. turnover £350k`,
  },
  {
    institution: "Got Capital",
    email: null,
    notes: `Unsecured business loan | £2k–£200k | Factor rate 1.45–1.5 | 4–7 months | 3 months trading | Min. turnover £60k | Open banking required | Refuses: financial lending, legal sector, other brokers`,
  },
  {
    institution: "Iwoca",
    email: "brokers@iwoca.co.uk",
    notes: `Unsecured business loan | £1k–£1m | 10% annual turnover | 1.10%–5.95% pm | 1–60 months | No min. trading | Refuses: active strikeoff, PayPal-only, adult, firearms, gambling, vehicle sales, jewellery | Contact: brokers@iwoca.co.uk`,
  },
  {
    institution: "Funding Circle",
    email: null,
    notes: `Unsecured business loan (loans >£50k) | £10k–£750k | 40% annual turnover | 0.80%–5.75% pm | 12–72 months | 12 months trading (24 for construction) | Min. turnover £16,700 | Max amount 40% of latest filed turnover`,
  },
  {
    institution: "Mycashline",
    email: "brokers@mycashline.co.uk",
    notes: `Unsecured business loan (loans >£25k) | £5k–£250k | 30% annual turnover | 3%–3.99% pm | 1–24 months | 12 months trading | Min. turnover £180k | UK-wide | Contact: brokers@mycashline.co.uk`,
  },
  {
    institution: "Elect Capital",
    email: null,
    notes: `Unsecured business loan | £5k–£750k | Factor rate 1.25–1.55 | 6 months | 12 months trading | Min. turnover £300k | Comms increase with factor rate`,
  },
  {
    institution: "Capify",
    email: "rtanner@capify.co.uk",
    notes: `Unsecured business loan (loans >£75k) | £20k–£750k | 75–125% monthly turnover | Factor rate 1.2–1.48 | 3–12 months | 12 months trading | Min. turnover £120k | UK-wide | Contact: rtanner@capify.co.uk / proposal@capify.co.uk`,
  },
  {
    institution: "Rapital",
    email: null,
    notes: `Unsecured business loan | £5k–£250k | Factor rate 1.4–1.5 | 3–9 months | 3 months trading | Min. turnover £120k`,
  },
  {
    institution: "Cubefunder",
    email: null,
    notes: `Unsecured business loan (loans >£30k) | £5k–£100k | 3.50%–5% pm | 3–24 months | 3 months trading | Min. turnover £120k | Contact: Max`,
  },
  {
    institution: "Nucleus",
    email: null,
    notes: `Unsecured business loan | £10k–£500k | 1.40%–2.49% pm | 3–72 months | 12 months trading | Min. turnover £50k | Open banking for loans >£250k | Refuses: residential care for elderly/disabled, gambling, legal sector`,
  },
  {
    institution: "Lending Crowd",
    email: null,
    notes: `Unsecured business loan | £75k–£500k (secured >£350k) | x1.1 min. debt service cover | 6.95%–19.2% | 6–60 months | 24 months trading`,
  },
];

async function findExistingLenderContact(
  supabase: ReturnType<typeof createServiceSupabase>,
  organisationId: string,
  contactName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("contact_type", "Lender")
    .eq("name", contactName)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function expandBlInNotes(notes: string): string {
  return notes
    .replaceAll("Unsecured business loan (BL) |", "Unsecured business loan |")
    .replaceAll("Unsecured BL (", "Unsecured business loan (")
    .replaceAll("Unsecured BL |", "Unsecured business loan |")
    .replaceAll("unsecured BL above", "unsecured business loan above");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      "patch-geography": { type: "boolean", default: false },
      "patch-bl-notes": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values["patch-bl-notes"] === true) {
    const sb = createServiceSupabase();
    const { data: rows, error: fetchErr } = await sb
      .from("contacts")
      .select("id, notes")
      .eq("source", SOURCE_TAG);

    if (fetchErr) throw fetchErr;

    let updated = 0;
    for (const row of rows ?? []) {
      const next = expandBlInNotes(String(row.notes ?? ""));
      if (next === row.notes) continue;
      const { error } = await sb.from("contacts").update({ notes: next }).eq("id", row.id);
      if (error) throw error;
      updated += 1;
    }
    console.log(`Expanded BL → business loan in notes for ${updated} contact(s) (source=${SOURCE_TAG}).`);
    return;
  }

  if (values["patch-geography"] === true) {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("contacts")
      .update({ geography: "UK" })
      .eq("source", SOURCE_TAG)
      .select("id");

    if (error) throw error;
    console.log(`Updated geography to UK for ${data?.length ?? 0} contact(s) (source=${SOURCE_TAG}).`);
    return;
  }

  const dryRun = values["dry-run"] === true;
  const supabase = dryRun ? null : createServiceSupabase();

  let insertedOrgs = 0;
  let reusedOrgs = 0;
  let insertedContacts = 0;
  let skippedContacts = 0;

  for (const row of LENDERS) {
    const notesWithMeta = `${row.notes}\n\n— Import: ${SOURCE_TAG}`;

    if (dryRun) {
      console.log(`[dry-run] Would upsert org + Lender contact: ${row.institution}`);
      continue;
    }

    const sb = supabase!;

    const { data: orgMatch, error: orgFindErr } = await sb
      .from("organisations")
      .select("id")
      .eq("name", row.institution)
      .limit(1);

    if (orgFindErr) throw orgFindErr;

    let organisationId: string;

    if (orgMatch && orgMatch.length > 0) {
      organisationId = String(orgMatch[0]!.id);
      reusedOrgs += 1;
    } else {
      const { data: org, error: orgErr } = await sb
        .from("organisations")
        .insert({
          name: row.institution,
          type: "lender",
          description: null,
        })
        .select("id")
        .single();

      if (orgErr) throw orgErr;
      organisationId = String(org!.id);
      insertedOrgs += 1;
    }

    const exists = await findExistingLenderContact(sb, organisationId, row.institution);
    if (exists) {
      console.log(`Skip (already exists): ${row.institution}`);
      skippedContacts += 1;
      continue;
    }

    const { error: contactErr } = await sb.from("contacts").insert({
      name: row.institution,
      contact_type: "Lender",
      sector: "financial_services",
      organisation_id: organisationId,
      role: null,
      geography: "UK",
      phone: null,
      email: row.email,
      website_url: null,
      notes: notesWithMeta,
      deal_types: null,
      min_deal_size: null,
      max_deal_size: null,
      source: SOURCE_TAG,
      internal_owner: null,
    });

    if (contactErr) throw contactErr;
    insertedContacts += 1;
    console.log(`Inserted: ${row.institution}`);
  }

  if (dryRun) {
    console.log(`\nDry run complete. ${LENDERS.length} lenders would be processed.`);
    return;
  }

  console.log(
    `\nDone. Organisations created: ${insertedOrgs}, reused: ${reusedOrgs}. Contacts inserted: ${insertedContacts}, skipped: ${skippedContacts}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
