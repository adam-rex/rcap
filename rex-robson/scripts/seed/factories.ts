import { faker } from "@faker-js/faker";
import { randomUUID } from "node:crypto";

const ORG_TYPES = [
  "fund",
  "family_office",
  "advisor",
  "corporate",
  "endowment",
] as const;

const CONTACT_DEAL_TYPES = [
  "growth_equity",
  "venture",
  "buyout",
  "co_invest",
  "secondaries",
  "m_and_a",
  "private_placement",
  "credit",
] as const;

const SECTORS = [
  "saas",
  "fintech",
  "healthcare_it",
  "industrials",
  "logistics",
  "business_services",
  "consumer",
  "energy",
  "real_estate",
] as const;

const SOURCES = [
  "conference",
  "linkedin",
  "referral",
  "event",
  "inbound",
  "warm_intro",
] as const;

const ROLES = [
  "Partner",
  "Principal",
  "Managing Director",
  "Director",
  "Vice President",
  "Associate",
  "Analyst",
] as const;

const CONTACT_TYPES = [
  "Founder",
  "Investor",
  "Lender",
] as const;

const MATCH_OUTCOMES = ["won", "lost", "passed"] as const;
const MATCH_KINDS = ["founder_investor", "founder_lender"] as const;
type MatchStage = "introduced" | "active" | "closed";

function pickMany<T extends readonly string[]>(
  pool: T,
  min: number,
  max: number,
): string[] {
  const n = faker.number.int({ min, max });
  return faker.helpers.arrayElements([...pool], n);
}

function pickOne<T extends readonly string[]>(pool: T): T[number] {
  return faker.helpers.arrayElement([...pool]);
}

export type OrganisationRow = {
  id: string;
  name: string;
  type: string;
  description: string;
};

export type ContactRow = {
  id: string;
  name: string;
  organisation_id: string;
  contact_type: (typeof CONTACT_TYPES)[number];
  role: string;
  deal_types: string[];
  min_deal_size: number | null;
  max_deal_size: number | null;
  sector: string;
  sectors: string[];
  geography: string;
  relationship_score: number;
  last_contact_date: string;
  notes: string;
  source: string;
};

export type MatchRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: (typeof MATCH_KINDS)[number];
  stage: MatchStage;
  outcome: (typeof MATCH_OUTCOMES)[number] | null;
  context: string;
  notes: string | null;
};

export type StructuredSuggestionRow = {
  id: string;
  title: string;
  body: string;
  status: "pending";
  contact_a_id: string;
  contact_b_id: string;
  kind: (typeof MATCH_KINDS)[number];
  score: number;
};

export type RexTaskRow = {
  title: string;
  detail: string | null;
  status: "pending" | "running" | "done" | "dismissed";
  source: "manual" | "meeting_note" | "email" | "import";
  due_at: string | null;
};

export function createOrganisations(num: number): OrganisationRow[] {
  const rows: OrganisationRow[] = [];
  for (let i = 0; i < num; i++) {
    const label = faker.company.name();
    rows.push({
      id: randomUUID(),
      name: `${label} ${faker.helpers.arrayElement(["Capital", "Partners", "Holdings", "Group", "Advisors"])}`,
      type: pickOne(ORG_TYPES),
      description: faker.company.catchPhrase(),
    });
  }
  return rows;
}

export function createContacts(
  organisations: OrganisationRow[],
  num: number,
): ContactRow[] {
  if (organisations.length === 0) {
    throw new Error("createContacts requires at least one organisation.");
  }
  const rows: ContactRow[] = [];
  for (let i = 0; i < num; i++) {
    const org = organisations[i % organisations.length]!;
    const hasRange = faker.datatype.boolean({ probability: 0.85 });
    let min_deal_size: number | null = null;
    let max_deal_size: number | null = null;
    if (hasRange) {
      const minM = faker.number.int({ min: 1, max: 40 });
      const span = faker.number.int({ min: 5, max: 80 });
      min_deal_size = minM * 1_000_000;
      max_deal_size = (minM + span) * 1_000_000;
    }
    const primarySector = pickOne(SECTORS);
    rows.push({
      id: randomUUID(),
      name: faker.person.fullName(),
      organisation_id: org.id,
      contact_type: pickOne(CONTACT_TYPES),
      role: pickOne(ROLES),
      deal_types: pickMany(CONTACT_DEAL_TYPES, 1, 3),
      min_deal_size,
      max_deal_size,
      sector: primarySector,
      sectors: Array.from(new Set([primarySector, ...pickMany(SECTORS, 0, 2)])),
      geography: faker.location.country(),
      relationship_score: Number(
        faker.number.float({ min: 0.35, max: 0.99, fractionDigits: 2 }),
      ),
      last_contact_date: faker.date
        .recent({ days: 365 })
        .toISOString()
        .slice(0, 10),
      notes: faker.lorem.sentence({ min: 8, max: 24 }),
      source: pickOne(SOURCES),
    });
  }
  return rows;
}

function splitByType(contacts: ContactRow[]): {
  founders: ContactRow[];
  investors: ContactRow[];
  lenders: ContactRow[];
} {
  return {
    founders: contacts.filter((c) => c.contact_type === "Founder"),
    investors: contacts.filter((c) => c.contact_type === "Investor"),
    lenders: contacts.filter((c) => c.contact_type === "Lender"),
  };
}

/**
 * Produce matches across the three stages, with realistic outcomes on closed rows.
 * Uses deterministic pair keys so we never emit the same (kind, pair) twice inside one batch.
 */
export function createMatches(
  contacts: ContactRow[],
  num: number,
): MatchRow[] {
  if (contacts.length < 2) return [];
  const { founders, investors, lenders } = splitByType(contacts);
  const rows: MatchRow[] = [];
  const seenKeys = new Set<string>();

  const makePair = (
    kind: (typeof MATCH_KINDS)[number],
  ): [ContactRow, ContactRow] | null => {
    if (founders.length === 0) return null;
    const counterparts = kind === "founder_investor" ? investors : lenders;
    if (counterparts.length === 0) return null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const a = faker.helpers.arrayElement(founders);
      const b = faker.helpers.arrayElement(counterparts);
      if (a.id === b.id) continue;
      const key = `${kind}:${[a.id, b.id].sort().join(":")}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      return [a, b];
    }
    return null;
  };

  const stagePlan: MatchStage[] = [];
  const introCount = Math.ceil(num * 0.4);
  const activeCount = Math.ceil(num * 0.35);
  const closedCount = Math.max(0, num - introCount - activeCount);
  for (let i = 0; i < introCount; i += 1) stagePlan.push("introduced");
  for (let i = 0; i < activeCount; i += 1) stagePlan.push("active");
  for (let i = 0; i < closedCount; i += 1) stagePlan.push("closed");

  for (const stage of stagePlan) {
    const kind = pickOne(MATCH_KINDS);
    const pair = makePair(kind);
    if (!pair) continue;
    const [a, b] = pair;
    const outcome: MatchRow["outcome"] =
      stage === "closed" ? pickOne(MATCH_OUTCOMES) : null;
    const context = `${a.name} (${a.sector}) × ${b.name} (${b.sector}). ${faker.lorem.sentence({ min: 8, max: 16 })}`;
    const notes = faker.datatype.boolean({ probability: 0.5 })
      ? faker.lorem.sentence({ min: 6, max: 14 })
      : null;
    rows.push({
      id: randomUUID(),
      contact_a_id: a.id,
      contact_b_id: b.id,
      kind,
      stage,
      outcome,
      context,
      notes,
    });
  }
  return rows;
}

/**
 * Pending structured suggestions. Skips any pair that already has a match to avoid the
 * partial-unique index collision between open matches and pending suggestions.
 */
export function createStructuredSuggestions(
  contacts: ContactRow[],
  existingMatches: MatchRow[],
  num: number,
): StructuredSuggestionRow[] {
  if (contacts.length < 2) return [];
  const { founders, investors, lenders } = splitByType(contacts);
  const taken = new Set<string>();
  for (const m of existingMatches) {
    taken.add(
      `${m.kind}:${[m.contact_a_id, m.contact_b_id].sort().join(":")}`,
    );
  }

  const rows: StructuredSuggestionRow[] = [];
  for (let i = 0; i < num; i += 1) {
    const kind = pickOne(MATCH_KINDS);
    const counterparts = kind === "founder_investor" ? investors : lenders;
    if (founders.length === 0 || counterparts.length === 0) continue;
    let pair: [ContactRow, ContactRow] | null = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const a = faker.helpers.arrayElement(founders);
      const b = faker.helpers.arrayElement(counterparts);
      if (a.id === b.id) continue;
      const key = `${kind}:${[a.id, b.id].sort().join(":")}`;
      if (taken.has(key)) continue;
      taken.add(key);
      pair = [a, b];
      break;
    }
    if (!pair) continue;
    const [a, b] = pair;
    const title = `${a.name} <> ${b.name}`;
    const score = Number(
      faker.number.float({ min: 0.55, max: 0.95, fractionDigits: 2 }),
    );
    const body = [
      `**${a.name}** (founder) <> **${b.name}** (${kind === "founder_investor" ? "investor" : "lender"})`,
      `- Sector overlap: ${a.sector}`,
      `- Geography: ${a.geography} / ${b.geography}`,
      `- Match score: ${score.toFixed(2)}`,
    ].join("\n");
    rows.push({
      id: randomUUID(),
      title,
      body,
      status: "pending",
      contact_a_id: a.id,
      contact_b_id: b.id,
      kind,
      score,
    });
  }
  return rows;
}

export function createRexTasks(num: number): RexTaskRow[] {
  const rows: RexTaskRow[] = [];
  const verb = ["Draft", "Prepare", "Review", "Compile", "Send"];
  const nouns = [
    "match brief",
    "follow-up list",
    "intro note",
    "lender fit summary",
    "meeting recap",
  ];
  for (let i = 0; i < num; i += 1) {
    const title = `${faker.helpers.arrayElement(verb)} ${faker.helpers.arrayElement(nouns)} for ${faker.company.name()}`;
    const source = faker.helpers.arrayElement([
      "manual",
      "meeting_note",
      "email",
      "import",
    ] as const);
    const status = faker.helpers.arrayElement([
      "pending",
      "pending",
      "running",
      "done",
      "dismissed",
    ] as const);
    const dueAt =
      faker.datatype.boolean({ probability: 0.6 }) && status !== "done"
        ? faker.date.soon({ days: 10 }).toISOString()
        : null;
    rows.push({
      title,
      detail: faker.lorem.sentence({ min: 8, max: 20 }),
      source,
      status,
      due_at: dueAt,
    });
  }
  return rows;
}

const EXTRACTION_KINDS = [
  "contact",
  "organisation",
  "intro_request",
] as const;

export type RexInboundEmailRow = {
  id: string;
  received_at: string;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  external_message_id: string;
  thread_participant_count: number | null;
};

export type RexEmailExtractionRow = {
  email_id: string;
  kind: (typeof EXTRACTION_KINDS)[number];
  status: "pending";
  title: string;
  summary: string | null;
  detail: string | null;
  payload: Record<string, unknown>;
};

export type RexInboundEmailAttachmentRow = {
  email_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
};

function extractionForKind(
  kind: (typeof EXTRACTION_KINDS)[number],
): Pick<RexEmailExtractionRow, "title" | "summary" | "payload"> {
  const org = faker.company.name();
  const person = faker.person.fullName();
  switch (kind) {
    case "contact":
      return {
        title: person,
        summary: `${org} · ${pickOne(ROLES)} · ${faker.location.country()}`,
        payload: {
          name: person,
          organisationName: org,
          role: pickOne(ROLES),
          geography: faker.location.country(),
          notes: faker.lorem.sentence(),
        },
      };
    case "organisation":
      return {
        title: org,
        summary: `${pickOne(ORG_TYPES)} · ${faker.location.country()}`,
        payload: {
          name: org,
          type: pickOne(ORG_TYPES),
          geography: faker.location.country(),
          notes: faker.lorem.sentence(),
        },
      };
    case "intro_request":
      return {
        title: `Intro — ${person} / ${org}`,
        summary: `Warm intro context for ${faker.company.buzzPhrase()}`,
        payload: {
          requesterName: faker.person.fullName(),
          targetName: person,
          targetOrganisation: org,
          reason: faker.lorem.sentence(),
        },
      };
    default:
      return { title: "", summary: null, payload: {} };
  }
}

export type RexInboundEmailDataset = {
  emails: RexInboundEmailRow[];
  extractions: RexEmailExtractionRow[];
  attachments: RexInboundEmailAttachmentRow[];
};

/** Faker-driven inbox rows plus optional pending extractions and attachment metadata. */
export function createInboundEmailDataset(
  num: number,
  options?: {
    /** When true, force every generated email to be a meeting/call transcript style row. */
    callLogsOnly?: boolean;
    /** Ratio (0..1) of rows generated as call logs when callLogsOnly=false. Default 0.35. */
    callLogRatio?: number;
  },
): RexInboundEmailDataset {
  const emails: RexInboundEmailRow[] = [];
  const extractions: RexEmailExtractionRow[] = [];
  const attachments: RexInboundEmailAttachmentRow[] = [];
  const callLogsOnly = options?.callLogsOnly === true;
  const callLogRatio = Number.isFinite(options?.callLogRatio)
    ? Math.max(0, Math.min(1, Number(options?.callLogRatio)))
    : 0.35;

  const inbox = faker.helpers.arrayElement([
    "rex@workspace.local",
    "rex@robson.capital",
    "inbox@robson.capital",
  ]);

  for (let i = 0; i < num; i++) {
    const id = randomUUID();
    const isCallLog = callLogsOnly
      ? true
      : faker.datatype.boolean({ probability: callLogRatio });
    const fromName = isCallLog
      ? faker.helpers.arrayElement([
          "Otter Assistant",
          "Zoom AI Companion",
          "Fireflies Notetaker",
          "Granola Notes",
          "Gemini Notes",
        ])
      : faker.person.fullName();
    const fromAddress = isCallLog
      ? faker.helpers.arrayElement([
          "notes@otter.ai",
          "no-reply@zoom.us",
          "meetings@fireflies.ai",
          "notes@granola.ai",
          "workspace-noreply@gemini.google.com",
        ])
      : faker.internet.email({ firstName: fromName.split(" ")[0] });
    const subject = isCallLog
      ? faker.helpers.arrayElement([
          `Call with ${faker.company.name()} — meeting notes`,
          `${faker.person.fullName()} sync transcript`,
          `Weekly pipeline review call notes`,
          `Meeting transcript: ${faker.company.name()}`,
        ])
      : faker.lorem.sentence({ min: 4, max: 10 }).replace(/\.$/, "");
    const opening = isCallLog
      ? faker.helpers.arrayElement([
          "Transcript attached. Key actions and follow-ups extracted below.",
          "Here are your meeting notes and action items from today's call.",
          "Meeting recap generated automatically with suggested next steps.",
        ])
      : faker.lorem.sentence({ min: 6, max: 14 });
    const body = isCallLog
      ? [
          `Hi Rex,`,
          "",
          opening,
          "",
          `Summary: ${faker.lorem.sentence({ min: 10, max: 18 })}`,
          `Action items: ${faker.lorem.sentence({ min: 8, max: 14 })}`,
          "",
          `— ${fromName.split(" ")[0]}`,
        ].join("\n")
      : [
          `Hi Rex,`,
          "",
          opening,
          "",
          faker.lorem.paragraphs({ min: 1, max: 2 }, "\n\n"),
          "",
          `— ${fromName.split(" ")[0]}`,
        ].join("\n");
    const snippet =
      opening.length > 160 ? `${opening.slice(0, 157)}…` : opening;

    emails.push({
      id,
      received_at: faker.date.recent({ days: 21 }).toISOString(),
      from_name: fromName,
      from_address: fromAddress,
      to_addresses: [inbox],
      subject,
      body_text: body,
      body_html: null,
      snippet,
      external_message_id: `faker_${randomUUID()}`,
      thread_participant_count: faker.datatype.boolean({ probability: 0.35 })
        ? faker.number.int({ min: 2, max: 12 })
        : null,
    });

    if (faker.datatype.boolean({ probability: 0.45 })) {
      const kind = pickOne(EXTRACTION_KINDS);
      const part = extractionForKind(kind);
      extractions.push({
        email_id: id,
        kind,
        status: "pending",
        title: part.title,
        summary: part.summary,
        detail: null,
        payload: part.payload,
      });
    }

    if (faker.datatype.boolean({ probability: 0.28 })) {
      const ext = faker.helpers.arrayElement(["pdf", "docx", "xlsx", "png"]);
      const name =
        ext === "pdf"
          ? `${faker.word.words(2).replace(/\s+/g, "_")}.pdf`
          : `${faker.system.fileName({ extensionCount: 1 })}.${ext}`;
      const contentType =
        ext === "pdf"
          ? "application/pdf"
          : ext === "png"
            ? "image/png"
            : ext === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      attachments.push({
        email_id: id,
        filename: name,
        content_type: contentType,
        size_bytes: faker.number.int({ min: 12_000, max: 2_500_000 }),
      });
    }
  }

  return { emails, extractions, attachments };
}
