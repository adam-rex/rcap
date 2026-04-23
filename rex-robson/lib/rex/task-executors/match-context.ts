import type { SupabaseClient } from "@supabase/supabase-js";

export type ContactContext = {
  id: string;
  name: string;
  contact_type: string | null;
  role: string | null;
  sector: string | null;
  sectors: string[] | null;
  deal_types: string[] | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  geography: string | null;
  relationship_score: number | null;
  last_contact_date: string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  organisation: { id: string; name: string | null } | null;
};

export type MatchContext = {
  id: string;
  kind: "founder_investor" | "founder_lender";
  stage: "introduced" | "active" | "closed";
  outcome: "won" | "lost" | "passed" | null;
  context: string | null;
  notes: string | null;
  contactA: ContactContext;
  contactB: ContactContext;
};

const CONTACT_COLUMNS =
  "id,name,contact_type,role,sector,sectors,deal_types," +
  "min_deal_size,max_deal_size,geography,relationship_score," +
  "last_contact_date,notes,email,phone," +
  "organisation:organisations(id,name)";

const MATCH_COLUMNS =
  "id,kind,stage,outcome,context,notes," +
  `contact_a:contacts!matches_contact_a_id_fkey(${CONTACT_COLUMNS}),` +
  `contact_b:contacts!matches_contact_b_id_fkey(${CONTACT_COLUMNS})`;

function shapeContact(raw: Record<string, unknown> | null): ContactContext {
  if (!raw) {
    return {
      id: "",
      name: "(unknown)",
      contact_type: null,
      role: null,
      sector: null,
      sectors: null,
      deal_types: null,
      min_deal_size: null,
      max_deal_size: null,
      geography: null,
      relationship_score: null,
      last_contact_date: null,
      notes: null,
      email: null,
      phone: null,
      organisation: null,
    };
  }
  const org = raw.organisation as
    | { id: string; name: string | null }
    | null
    | undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "(unknown)"),
    contact_type: raw.contact_type == null ? null : String(raw.contact_type),
    role: raw.role == null ? null : String(raw.role),
    sector: raw.sector == null ? null : String(raw.sector),
    sectors: Array.isArray(raw.sectors) ? (raw.sectors as string[]) : null,
    deal_types: Array.isArray(raw.deal_types) ? (raw.deal_types as string[]) : null,
    min_deal_size:
      typeof raw.min_deal_size === "number" ? raw.min_deal_size : null,
    max_deal_size:
      typeof raw.max_deal_size === "number" ? raw.max_deal_size : null,
    geography: raw.geography == null ? null : String(raw.geography),
    relationship_score:
      typeof raw.relationship_score === "number"
        ? raw.relationship_score
        : null,
    last_contact_date:
      raw.last_contact_date == null ? null : String(raw.last_contact_date),
    notes: raw.notes == null ? null : String(raw.notes),
    email: raw.email == null ? null : String(raw.email),
    phone: raw.phone == null ? null : String(raw.phone),
    organisation: org ? { id: String(org.id), name: org.name ?? null } : null,
  };
}

export async function fetchMatchContext(
  client: SupabaseClient,
  matchId: string,
): Promise<MatchContext | null> {
  const { data, error } = await client
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const kindRaw = row.kind;
  const kind =
    kindRaw === "founder_lender" ? "founder_lender" : "founder_investor";
  const stageRaw = row.stage;
  const stage =
    stageRaw === "active" || stageRaw === "closed" ? stageRaw : "introduced";
  const outcomeRaw = row.outcome;
  const outcome =
    outcomeRaw === "won" || outcomeRaw === "lost" || outcomeRaw === "passed"
      ? outcomeRaw
      : null;
  return {
    id: String(row.id),
    kind,
    stage,
    outcome,
    context: row.context == null ? null : String(row.context),
    notes: row.notes == null ? null : String(row.notes),
    contactA: shapeContact(row.contact_a as Record<string, unknown> | null),
    contactB: shapeContact(row.contact_b as Record<string, unknown> | null),
  };
}

export async function fetchContactContext(
  client: SupabaseClient,
  contactId: string,
): Promise<ContactContext | null> {
  const { data, error } = await client
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return shapeContact(data as unknown as Record<string, unknown>);
}

export function formatGbp(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000)
    return `£${(Math.round(value / 100_000) / 10).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}M`;
  if (value >= 1_000)
    return `£${(Math.round(value / 100) / 10).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}K`;
  return `£${Math.round(value).toLocaleString()}`;
}

export function formatRange(
  min: number | null,
  max: number | null,
): string {
  if (min == null && max == null) return "—";
  return `${formatGbp(min)}–${formatGbp(max)}`;
}

/**
 * Convert a contact into a Markdown bullet list that's compact enough to paste
 * into every executor prompt without blowing past the context window.
 */
export function renderContactSummary(
  c: ContactContext,
  role: "founder" | "capital" | null = null,
): string {
  const lines: string[] = [];
  const title = role
    ? `${c.name} (${role === "founder" ? "founder" : "capital"})`
    : c.name;
  lines.push(`- ${title}`);
  if (c.contact_type) lines.push(`  - Type: ${c.contact_type}`);
  if (c.role) lines.push(`  - Role: ${c.role}`);
  if (c.organisation?.name) lines.push(`  - Org: ${c.organisation.name}`);
  const sectorBits = new Set<string>();
  if (c.sector) sectorBits.add(c.sector);
  for (const s of c.sectors ?? []) sectorBits.add(s);
  if (sectorBits.size > 0)
    lines.push(`  - Sectors: ${Array.from(sectorBits).join(", ")}`);
  if (c.deal_types && c.deal_types.length > 0)
    lines.push(`  - Deal types: ${c.deal_types.join(", ")}`);
  if (c.min_deal_size != null || c.max_deal_size != null)
    lines.push(
      `  - Deal size range: ${formatRange(c.min_deal_size, c.max_deal_size)}`,
    );
  if (c.geography) lines.push(`  - Geography: ${c.geography}`);
  if (c.relationship_score != null)
    lines.push(`  - Relationship score: ${c.relationship_score}`);
  if (c.last_contact_date)
    lines.push(`  - Last contacted: ${c.last_contact_date}`);
  if (c.email) lines.push(`  - Email: ${c.email}`);
  if (c.notes) lines.push(`  - Notes: ${c.notes}`);
  return lines.join("\n");
}

export function renderMatchSummary(m: MatchContext): string {
  const founderRole = "founder" as const;
  const capitalRole = "capital" as const;
  const lines: string[] = [];
  lines.push(
    `Match ${m.id} (${m.kind.replace("_", " / ")}, stage: ${m.stage}${m.outcome ? `, outcome: ${m.outcome}` : ""})`,
  );
  if (m.context) lines.push(`Context: ${m.context}`);
  if (m.notes) lines.push(`Internal notes: ${m.notes}`);
  lines.push("");
  lines.push("Side A:");
  lines.push(renderContactSummary(m.contactA, founderRole));
  lines.push("");
  lines.push("Side B:");
  lines.push(renderContactSummary(m.contactB, capitalRole));
  return lines.join("\n");
}
