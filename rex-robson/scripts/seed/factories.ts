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

const DEAL_STRUCTURES = [
  "Series A preferred",
  "Series B preferred",
  "majority_recap",
  "minority_growth",
  "buyout",
  "secondary",
  "credit_facility",
  "structured_equity",
] as const;

const DEAL_STATUSES = [
  "sourcing",
  "diligence",
  "ioi",
  "live",
  "passed",
  "closed",
] as const;

const DEAL_TYPES = [
  "equity deal",
  "debt deal",
  "invoice finance",
  "senior debt",
  "mezzanine debt",
  "bridging",
] as const;

const DEAL_STAGES = ["prospect", "active", "matching", "closed"] as const;

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
  name: string;
  organisation_id: string;
  role: string;
  deal_types: string[];
  min_deal_size: number | null;
  max_deal_size: number | null;
  sectors: string[];
  geography: string;
  relationship_score: number;
  last_contact_date: string;
  notes: string;
  source: string;
};

export type DealRow = {
  title: string;
  size: number;
  deal_type: string;
  deal_stage: (typeof DEAL_STAGES)[number];
  sector: string;
  structure: string;
  status: string;
  notes: string;
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
    rows.push({
      name: faker.person.fullName(),
      organisation_id: org.id,
      role: pickOne(ROLES),
      deal_types: pickMany(CONTACT_DEAL_TYPES, 1, 3),
      min_deal_size,
      max_deal_size,
      sectors: pickMany(SECTORS, 1, 3),
      geography: faker.location.country(),
      relationship_score: Number(faker.number.float({ min: 0.35, max: 0.99, fractionDigits: 2 })),
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

export function createDeals(num: number): DealRow[] {
  const rows: DealRow[] = [];
  for (let i = 0; i < num; i++) {
    const company = faker.company.name();
    const theme = faker.helpers.arrayElement([
      "platform recapitalization",
      "growth financing",
      "buyout",
      "co-invest opportunity",
      "carve-out",
    ]);
    rows.push({
      title: `${company} — ${theme}`,
      size: faker.number.int({ min: 5, max: 250 }) * 1_000_000,
      deal_type: pickOne(DEAL_TYPES),
      deal_stage: pickOne(DEAL_STAGES),
      sector: pickOne(SECTORS),
      structure: pickOne(DEAL_STRUCTURES),
      status: pickOne(DEAL_STATUSES),
      notes: faker.lorem.sentences({ min: 1, max: 3 }),
    });
  }
  return rows;
}

export function createRexTasks(num: number): RexTaskRow[] {
  const rows: RexTaskRow[] = [];
  const verb = ["Draft", "Prepare", "Review", "Compile", "Send"];
  const nouns = [
    "deal memo",
    "follow-up list",
    "intro brief",
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
  "deal_signal",
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
    case "deal_signal":
      return {
        title: `${faker.company.buzzNoun()} — ${pickOne(DEAL_STRUCTURES)}`,
        summary: `${faker.finance.amount({ min: 5, max: 120, dec: 0 })}M · ${pickOne(SECTORS)} · ${pickOne(DEAL_STATUSES)}`,
        payload: {
          title: `${faker.company.name()} — growth round`,
          size: faker.number.int({ min: 5, max: 150 }) * 1_000_000,
          dealType: pickOne(DEAL_TYPES),
          structure: pickOne(DEAL_STRUCTURES),
          sector: pickOne(SECTORS),
          status: pickOne(DEAL_STATUSES),
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
