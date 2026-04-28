#!/usr/bin/env npx tsx
/**
 * Verifies Supabase tables + storage needed for Rex email ingest.
 * Loads .env.local / .env like other scripts (see scripts/seed/env.ts).
 *
 * Usage:
 *   npm run verify:rex-email
 *
 * Optional: when E2E_NEXT_BASE_URL is set (e.g. http://localhost:3000), posts a minimal
 * JSON ingest to `/api/rex/email/ingest` with X-Rex-Ingest-Secret if REX_EMAIL_INGEST_SECRET is set.
 */

import { loadEnvFiles } from "./seed/env";
import { createClient } from "@supabase/supabase-js";

loadEnvFiles();

async function main(): Promise<void> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!url || !serviceRole) {
    console.error(
      "Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to verify schema.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = [
    "rex_inbound_emails",
    "rex_inbound_email_attachments",
    "rex_email_extractions",
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error) {
      console.error(`Table ${table}:`, error.message);
      process.exit(1);
    }
    console.log(`OK  table ${table}`);
  }

  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) {
    console.error("storage.listBuckets:", bErr.message);
    process.exit(1);
  }
  const hasAttachments = buckets?.some((b) => b.id === "rex-email-attachments");
  if (!hasAttachments) {
    console.error('Missing storage bucket "rex-email-attachments". Apply supabase/migrations.');
    process.exit(1);
  }
  console.log('OK  storage bucket "rex-email-attachments"');

  const e2eBase = process.env.E2E_NEXT_BASE_URL?.replace(/\/$/, "");
  if (e2eBase) {
    const secret = process.env.REX_EMAIL_INGEST_SECRET;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) headers["X-Rex-Ingest-Secret"] = secret;

    const res = await fetch(`${e2eBase}/api/rex/email/ingest`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fromAddress: "e2e-verify@example.com",
        subject: "Rex email ingest verify",
        bodyText: "Smoke test body",
      }),
    });
    const json = (await res.json()) as { ok?: boolean; emailId?: string; error?: string };
    if (!res.ok || !json.emailId) {
      console.error("E2E ingest failed:", res.status, json.error ?? json);
      process.exit(1);
    }
    console.log("OK  E2E POST /api/rex/email/ingest emailId=", json.emailId);
  } else {
    console.log(
      "Skip E2E HTTP ingest (set E2E_NEXT_BASE_URL and run the dev server to enable).",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
