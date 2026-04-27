#!/usr/bin/env npx tsx
/**
 * Parameterised Supabase seed (organisations → contacts → matches + suggestions; emails standalone).
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --orgs 5 --contacts 25 --matches 12 --suggestions 10
 *   npm run db:seed -- --append --contacts 5
 *   npm run db:seed -- --emails 0
 *   npm run db:seed -- --call-logs 10
 *   npm run db:seed -- --seed 4242
 */

import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker";
import {
  createContacts,
  createMatchTransactions,
  createMatches,
  createOrganisations,
  createStructuredSuggestions,
  type ContactRow,
  type MatchRow,
  type OrganisationRow,
  type StructuredSuggestionRow,
} from "./factories";
import { seedInboundEmails } from "./emailSeed";
import { seedCallLogs } from "./callLogSeed";
import { seedRexTasks } from "./taskSeed";
import { createServiceSupabase } from "./env";

const DUMMY = "00000000-0000-0000-0000-000000000000";

async function clearTables(supabase: SupabaseClient): Promise<void> {
  const { error: emh } = await supabase
    .from("match_stage_history")
    .delete()
    .neq("id", -1);
  if (emh) throw emh;
  const { error: e0 } = await supabase.from("rex_tasks").delete().neq("id", DUMMY);
  if (e0) throw e0;
  const { error: etx } = await supabase
    .from("match_transactions")
    .delete()
    .neq("id", DUMMY);
  if (etx) throw etx;
  const { error: em } = await supabase.from("matches").delete().neq("id", DUMMY);
  if (em) throw em;
  const { error: es } = await supabase
    .from("suggestions")
    .delete()
    .neq("id", DUMMY);
  if (es) throw es;
  const { error: e1 } = await supabase
    .from("contacts")
    .delete()
    .neq("id", DUMMY);
  if (e1) throw e1;
  const { error: e3 } = await supabase
    .from("organisations")
    .delete()
    .neq("id", DUMMY);
  if (e3) throw e3;
}

const CHUNK = 100;

async function insertChunked<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table:
    | "organisations"
    | "contacts"
    | "matches"
    | "match_transactions"
    | "suggestions",
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(slice);
    if (error) throw error;
  }
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== raw?.trim()) {
    throw new Error(`Invalid ${flag}: expected a non-negative integer, got "${raw}".`);
  }
  return n;
}

function printHelp(): void {
  console.log(`db:seed — fill organisations, contacts, matches, suggestions, and inbound emails with Faker data.

Options:
  --orgs, -o          Number of organisations (default: 3)
  --contacts, -c      Number of contacts (default: 10)
  --matches, -m       Number of matches across stages (default: 8)
  --suggestions, -s   Number of pending suggestions (default: 6)
  --emails, -e        Number of rex_inbound_emails rows (default: 5; 0 skips email seeding)
  --call-logs, -l     Number of call-log rows in rex_inbound_emails (default: 4; 0 skips call-log seeding)
  --tasks, -t         Number of rex_tasks rows (default: 8; 0 skips task seeding)
  --append, -a        Skip clearing tables before insert
  --seed              Faker seed for reproducible runs (number)
  --help, -h          Show this message

Examples:
  npm run db:seed -- --orgs 8 --contacts 40 --matches 15 --suggestions 12
  npm run db:seed -- --emails 0
  npm run db:seed -- --seed 12345
`);
}

export type SeedOptions = {
  orgCount: number;
  contactCount: number;
  matchCount: number;
  suggestionCount: number;
  emailCount: number;
  callLogCount: number;
  taskCount: number;
  append: boolean;
  fakerSeed?: number;
};

export async function seedDatabase(
  supabase: SupabaseClient,
  options: SeedOptions,
): Promise<{
  organisations: OrganisationRow[];
  contacts: ContactRow[];
  matches: MatchRow[];
  suggestions: StructuredSuggestionRow[];
  emailRows: number;
  callLogRows: number;
  taskRows: number;
  extractionRows: number;
  attachmentRows: number;
}> {
  const {
    orgCount,
    contactCount,
    matchCount,
    suggestionCount,
    emailCount,
    callLogCount,
    taskCount,
    append,
    fakerSeed,
  } = options;

  if (contactCount > 0 && orgCount === 0) {
    throw new Error("--contacts requires at least one organisation (--orgs >= 1).");
  }

  if (fakerSeed !== undefined) {
    faker.seed(fakerSeed);
  }

  if (!append) {
    await clearTables(supabase);
  }

  const organisations = createOrganisations(orgCount);
  const contacts =
    orgCount > 0 ? createContacts(organisations, contactCount) : [];
  const matches = createMatches(contacts, matchCount);
  const matchTransactions = createMatchTransactions(matches);
  const suggestions = createStructuredSuggestions(
    contacts,
    matches,
    suggestionCount,
  );

  if (organisations.length > 0) {
    await insertChunked(supabase, "organisations", organisations);
  }
  if (contacts.length > 0) {
    await insertChunked(supabase, "contacts", contacts);
  }
  if (matches.length > 0) {
    await insertChunked(supabase, "matches", matches);
  }
  if (matchTransactions.length > 0) {
    await insertChunked(supabase, "match_transactions", matchTransactions);
  }
  if (suggestions.length > 0) {
    await insertChunked(supabase, "suggestions", suggestions);
  }

  const { emails, extractions, attachments } = await seedInboundEmails(supabase, {
    count: emailCount,
    append,
  });
  const {
    emails: callLogEmails,
    extractions: callLogExtractions,
    attachments: callLogAttachments,
  } = await seedCallLogs(supabase, {
    count: callLogCount,
    append: true,
  });
  const tasks = await seedRexTasks(supabase, {
    count: taskCount,
    append: true,
    matches,
    contacts,
  });

  return {
    organisations,
    contacts,
    matches,
    suggestions,
    emailRows: emails.length,
    callLogRows: callLogEmails.length,
    taskRows: tasks.length,
    extractionRows: extractions.length + callLogExtractions.length,
    attachmentRows: attachments.length + callLogAttachments.length,
  };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      orgs: { type: "string", short: "o", default: "3" },
      contacts: { type: "string", short: "c", default: "10" },
      matches: { type: "string", short: "m", default: "8" },
      suggestions: { type: "string", short: "s", default: "6" },
      emails: { type: "string", short: "e", default: "5" },
      "call-logs": { type: "string", short: "l", default: "4" },
      tasks: { type: "string", short: "t", default: "8" },
      append: { type: "boolean", short: "a", default: false },
      seed: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help || positionals.includes("help")) {
    printHelp();
    return;
  }

  const orgCount = parsePositiveInt(values.orgs, "--orgs");
  const contactCount = parsePositiveInt(values.contacts, "--contacts");
  const matchCount = parsePositiveInt(values.matches, "--matches");
  const suggestionCount = parsePositiveInt(values.suggestions, "--suggestions");
  const emailCount = parsePositiveInt(values.emails, "--emails");
  const callLogCount = parsePositiveInt(values["call-logs"], "--call-logs");
  const taskCount = parsePositiveInt(values.tasks, "--tasks");
  const fakerSeed =
    values.seed !== undefined ? parsePositiveInt(values.seed, "--seed") : undefined;

  const supabase = createServiceSupabase();

  const {
    organisations,
    contacts,
    matches,
    suggestions,
    emailRows,
    callLogRows,
    taskRows,
    extractionRows,
    attachmentRows,
  } = await seedDatabase(supabase, {
    orgCount,
    contactCount,
    matchCount,
    suggestionCount,
    emailCount,
    callLogCount,
    taskCount,
    append: values.append,
    fakerSeed,
  });

  const emailLine =
    emailCount > 0 ? ` ${emailRows} inbound emails.` : "";
  const callLogLine = callLogCount > 0 ? ` ${callLogRows} call logs.` : "";
  const taskLine = taskCount > 0 ? ` ${taskRows} Rex tasks.` : "";
  const extractionLine =
    emailCount > 0 || callLogCount > 0
      ? ` ${extractionRows} extractions, ${attachmentRows} attachments.`
      : "";

  console.log(
    `Seeded ${organisations.length} organisations, ${contacts.length} contacts, ${matches.length} matches, ${suggestions.length} suggestions.${emailLine}${callLogLine}${taskLine}${extractionLine}` +
      (values.append ? " (append mode)" : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
