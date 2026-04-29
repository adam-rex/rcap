import type { SupabaseClient } from "@supabase/supabase-js";
import { insertWorkspaceSuggestion } from "@/lib/data/workspace-mutations";

/** Minimum raw `scorePair()` total for a pair to surface as a suggestion (see `@/lib/match/suggestion-score` for 1–5 tiers). */
const MIN_SCORE = 5;
const PER_FOUNDER_CAP = 4;
const PER_CAPITAL_CAP = 3;
const GLOBAL_CAP = 25;
const HIGH_WARMTH_SCORE = 7;
const COLD_DAYS = 365;

type Side = "founder" | "investor" | "lender";
type CapitalSide = Extract<Side, "investor" | "lender">;

type ContactForMatch = {
  id: string;
  name: string;
  contact_type: string | null;
  sector: string | null;
  sectors: string[] | null;
  role: string | null;
  deal_types: string[] | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  geography: string | null;
  relationship_score: number | null;
  last_contact_date: string | null;
};

type MatchKind = "founder_investor" | "founder_lender";

type Candidate = {
  founder: ContactForMatch;
  capital: ContactForMatch;
  capitalSide: CapitalSide;
  kind: MatchKind;
  score: number;
  reasons: string[];
  sectorOverlap: string[];
  dealTypeOverlap: string[];
  sizeOverlap: { capMin: number; capMax: number; foundMin: number; foundMax: number } | null;
  geoOverlap: string[];
};

function contactSide(c: ContactForMatch): Side | null {
  const t = (c.contact_type ?? "").toLowerCase();
  const r = (c.role ?? "").toLowerCase();
  const hit = (s: string) => t.includes(s) || r.includes(s);
  if (hit("founder")) return "founder";
  if (hit("lender") || hit("debt") || hit("credit") || hit("bank"))
    return "lender";
  if (hit("investor") || hit("vc") || hit("lp")) return "investor";
  return null;
}

function normalizeTokens(value: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[,\/\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sectorSet(c: ContactForMatch): Set<string> {
  const out = new Set<string>();
  if (c.sector?.trim()) out.add(c.sector.trim().toLowerCase());
  for (const x of c.sectors ?? []) {
    const v = String(x).trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

function dealTypeSet(c: ContactForMatch): Set<string> {
  const out = new Set<string>();
  for (const x of c.deal_types ?? []) {
    const v = String(x).trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) {
    if (b.has(x)) out.push(x);
  }
  return out;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function sizeRangesOverlap(
  a: ContactForMatch,
  b: ContactForMatch,
): { capMin: number; capMax: number; foundMin: number; foundMax: number } | null {
  const aMin = a.min_deal_size;
  const aMax = a.max_deal_size;
  const bMin = b.min_deal_size;
  const bMax = b.max_deal_size;
  if (aMin == null && aMax == null && bMin == null && bMax == null) return null;
  const lowA = aMin ?? 0;
  const highA = aMax ?? Number.POSITIVE_INFINITY;
  const lowB = bMin ?? 0;
  const highB = bMax ?? Number.POSITIVE_INFINITY;
  if (lowA <= highB && lowB <= highA) {
    return { capMin: lowA, capMax: highA, foundMin: lowB, foundMax: highB };
  }
  return null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function formatGbp(n: number): string {
  if (!Number.isFinite(n)) return "any";
  if (n >= 1_000_000) return `£${(Math.round(n / 100_000) / 10).toLocaleString()}M`;
  if (n >= 1_000) return `£${(Math.round(n / 100) / 10).toLocaleString()}K`;
  return `£${Math.round(n).toLocaleString()}`;
}

/**
 * Heuristic match strength (integer). Persisted as `suggestions.score` and shown
 * in the UI as match-fit tiers via `@/lib/match/suggestion-score`.
 */
function scorePair(
  founder: ContactForMatch,
  capital: ContactForMatch,
): Omit<Candidate, "founder" | "capital" | "capitalSide" | "kind"> {
  let score = 0;
  const reasons: string[] = [];

  const sectorOverlap = intersect(sectorSet(founder), sectorSet(capital));
  if (sectorOverlap.length > 0) {
    const bump = Math.min(sectorOverlap.length, 2) * 2;
    score += bump;
    reasons.push(`Sector: ${sectorOverlap.map(titleCase).join(", ")}`);
  }

  const dealTypeOverlap = intersect(dealTypeSet(founder), dealTypeSet(capital));
  if (dealTypeOverlap.length > 0) {
    const bump = Math.min(dealTypeOverlap.length, 2) * 2;
    score += bump;
    reasons.push(`Deal type: ${dealTypeOverlap.map(titleCase).join(", ")}`);
  }

  const sizeOverlap = sizeRangesOverlap(capital, founder);
  if (sizeOverlap) {
    score += 3;
    const capRange = `${formatGbp(sizeOverlap.capMin)}–${formatGbp(sizeOverlap.capMax)}`;
    const foundRange = `${formatGbp(sizeOverlap.foundMin)}–${formatGbp(sizeOverlap.foundMax)}`;
    reasons.push(`Cheque: ${capRange} appetite fits ${foundRange} need`);
  }

  const geoOverlap = intersect(
    new Set(normalizeTokens(founder.geography)),
    new Set(normalizeTokens(capital.geography)),
  );
  if (geoOverlap.length > 0) {
    score += 2;
    reasons.push(`Geography: ${geoOverlap.map(titleCase).join(", ")}`);
  }

  const fScore = founder.relationship_score ?? 0;
  const cScore = capital.relationship_score ?? 0;
  if (fScore >= HIGH_WARMTH_SCORE || cScore >= HIGH_WARMTH_SCORE) {
    score += 1;
    reasons.push(`Warm side: score ${Math.max(fScore, cScore)}`);
  }

  const fDays = daysSince(founder.last_contact_date);
  const cDays = daysSince(capital.last_contact_date);
  if (fDays != null && cDays != null && fDays > COLD_DAYS && cDays > COLD_DAYS) {
    score -= 1;
    reasons.push(`Cold: both last contacted >${COLD_DAYS}d ago`);
  }

  return {
    score,
    reasons,
    sectorOverlap,
    dealTypeOverlap,
    sizeOverlap,
    geoOverlap,
  };
}

async function fetchAllContactsForMatching(
  client: SupabaseClient,
): Promise<ContactForMatch[]> {
  const pageSize = 1000;
  const out: ContactForMatch[] = [];
  const columns =
    "id,name,contact_type,sector,sectors,role,deal_types,min_deal_size,max_deal_size,geography,relationship_score,last_contact_date";
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("contacts")
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as ContactForMatch[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function pairKey(idA: string, idB: string, kind: MatchKind): string {
  return `${kind}:${[idA, idB].sort().join(":")}`;
}

/**
 * Loads existing pending or acted (live match) pair keys so we never re-emit a
 * pair that already has a suggestion or match in flight. Closed matches don't
 * block — the same pair can be re-introduced later with a new context.
 */
async function loadExistingPairKeys(
  client: SupabaseClient,
): Promise<Set<string>> {
  const keys = new Set<string>();

  const { data: sugRows, error: sugErr } = await client
    .from("suggestions")
    .select("contact_a_id,contact_b_id,kind,status")
    .in("status", ["pending", "acted"])
    .not("contact_a_id", "is", null)
    .not("contact_b_id", "is", null)
    .not("kind", "is", null);
  if (sugErr) throw sugErr;
  for (const raw of sugRows ?? []) {
    const r = raw as {
      contact_a_id: string;
      contact_b_id: string;
      kind: string | null;
    };
    if (r.kind !== "founder_investor" && r.kind !== "founder_lender") continue;
    keys.add(pairKey(r.contact_a_id, r.contact_b_id, r.kind));
  }

  const { data: matchRows, error: matchErr } = await client
    .from("matches")
    .select("contact_a_id,contact_b_id,kind,stage")
    .neq("stage", "closed");
  if (matchErr) throw matchErr;
  for (const raw of matchRows ?? []) {
    const r = raw as {
      contact_a_id: string;
      contact_b_id: string;
      kind: string;
    };
    if (r.kind !== "founder_investor" && r.kind !== "founder_lender") continue;
    keys.add(pairKey(r.contact_a_id, r.contact_b_id, r.kind));
  }

  return keys;
}

function buildSuggestionBody(c: Candidate): string {
  const headline = `**${c.founder.name}** (founder) <> **${c.capital.name}** (${c.capitalSide})`;

  const why: string[] = [];
  if (c.sectorOverlap.length > 0)
    why.push(`- Sector: ${c.sectorOverlap.map(titleCase).join(", ")}`);
  if (c.dealTypeOverlap.length > 0)
    why.push(`- Deal type: ${c.dealTypeOverlap.map(titleCase).join(", ")}`);
  if (c.sizeOverlap) {
    const capRange = `${formatGbp(c.sizeOverlap.capMin)}–${formatGbp(c.sizeOverlap.capMax)}`;
    const foundRange = `${formatGbp(c.sizeOverlap.foundMin)}–${formatGbp(c.sizeOverlap.foundMax)}`;
    why.push(`- Cheque: ${capRange} appetite fits ${foundRange} need`);
  }
  if (c.geoOverlap.length > 0)
    why.push(`- Geography: ${c.geoOverlap.map(titleCase).join(", ")}`);

  const warmth: string[] = [];
  const founderLine = warmthLine(c.founder);
  const capitalLine = warmthLine(c.capital);
  if (founderLine) warmth.push(`- ${c.founder.name}: ${founderLine}`);
  if (capitalLine) warmth.push(`- ${c.capital.name}: ${capitalLine}`);

  const lines: string[] = [headline];
  if (why.length > 0)
    lines.push("", "## Why this match", "", ...why);
  if (warmth.length > 0) lines.push("", "## Warmth", "", ...warmth);
  return lines.join("\n");
}

function warmthLine(c: ContactForMatch): string | null {
  const parts: string[] = [];
  if (c.last_contact_date) {
    const days = daysSince(c.last_contact_date);
    parts.push(
      `last contacted ${c.last_contact_date}${days != null ? ` (${days}d ago)` : ""}`,
    );
  }
  if (c.relationship_score != null) {
    parts.push(`score ${c.relationship_score}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function topReasonLabel(c: Candidate): string {
  if (c.sectorOverlap.length > 0) return titleCase(c.sectorOverlap[0]);
  if (c.dealTypeOverlap.length > 0) return titleCase(c.dealTypeOverlap[0]);
  if (c.sizeOverlap) return "size fit";
  if (c.geoOverlap.length > 0) return titleCase(c.geoOverlap[0]);
  return "shared context";
}

function buildSuggestionTitle(c: Candidate): string {
  return `Intro: ${c.founder.name} <> ${c.capital.name} (${c.capitalSide}, ${topReasonLabel(c)})`;
}

export type GenerateIntroMatchesResult = {
  created: number;
  skippedDuplicates: number;
  skippedBelowThreshold: number;
  runMs: number;
};

export type IntroMatchForContact = {
  suggestionId: string | null;
  title: string;
  reasons: string[];
  counterpartyId: string;
  counterpartyName: string;
  counterpartySide: Side;
  score: number;
};

const PER_CONTACT_DEFAULT_LIMIT = 3;

async function fetchContactById(
  client: SupabaseClient,
  id: string,
): Promise<ContactForMatch | null> {
  const columns =
    "id,name,contact_type,sector,sectors,role,deal_types,min_deal_size,max_deal_size,geography,relationship_score,last_contact_date";
  const { data, error } = await client
    .from("contacts")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as ContactForMatch;
}

/**
 * Score and persist intro matches centred on a single contact (the one the
 * user just captured). The contact plays whichever side its `contact_type`
 * indicates; it's paired against the opposite pool only. Returns the top
 * matches so the UI can render them inline after save.
 */
export async function generateIntroMatchesForContact(
  client: SupabaseClient,
  contactId: string,
  limit: number = PER_CONTACT_DEFAULT_LIMIT,
): Promise<IntroMatchForContact[]> {
  const subject = await fetchContactById(client, contactId);
  if (!subject) return [];
  const side = contactSide(subject);
  if (!side) return [];

  const [allContacts, existingKeys] = await Promise.all([
    fetchAllContactsForMatching(client),
    loadExistingPairKeys(client),
  ]);

  const others = allContacts.filter((c) => c.id !== subject.id);
  const candidates: Candidate[] = [];

  if (side === "founder") {
    for (const other of others) {
      const otherSide = contactSide(other);
      if (otherSide !== "investor" && otherSide !== "lender") continue;
      const scored = scorePair(subject, other);
      if (scored.score < MIN_SCORE) continue;
      candidates.push({
        founder: subject,
        capital: other,
        capitalSide: otherSide,
        kind: otherSide === "investor" ? "founder_investor" : "founder_lender",
        ...scored,
      });
    }
  } else {
    const capitalSide: CapitalSide = side;
    for (const other of others) {
      const otherSide = contactSide(other);
      if (otherSide !== "founder") continue;
      const scored = scorePair(other, subject);
      if (scored.score < MIN_SCORE) continue;
      candidates.push({
        founder: other,
        capital: subject,
        capitalSide,
        kind: capitalSide === "investor" ? "founder_investor" : "founder_lender",
        ...scored,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aWarm = Math.max(
      a.founder.relationship_score ?? 0,
      a.capital.relationship_score ?? 0,
    );
    const bWarm = Math.max(
      b.founder.relationship_score ?? 0,
      b.capital.relationship_score ?? 0,
    );
    return bWarm - aWarm;
  });

  const matches: IntroMatchForContact[] = [];
  const cap = Math.max(1, Math.min(limit, 10));

  for (const cand of candidates) {
    if (matches.length >= cap) break;
    const key = pairKey(cand.founder.id, cand.capital.id, cand.kind);
    const counterparty =
      cand.founder.id === subject.id ? cand.capital : cand.founder;
    const counterpartySide = contactSide(counterparty) ?? "founder";

    let suggestionId: string | null = null;
    if (!existingKeys.has(key)) {
      const title = buildSuggestionTitle(cand);
      const body = buildSuggestionBody(cand);
      const row = await insertWorkspaceSuggestion(client, {
        title,
        body,
        contact_a_id: cand.founder.id,
        contact_b_id: cand.capital.id,
        kind: cand.kind,
        score: cand.score,
      });
      if (row) {
        suggestionId = row.id;
        existingKeys.add(key);
      }
    }

    matches.push({
      suggestionId,
      title: buildSuggestionTitle(cand),
      reasons: cand.reasons,
      counterpartyId: counterparty.id,
      counterpartyName: counterparty.name,
      counterpartySide,
      score: cand.score,
    });
  }

  return matches;
}

/**
 * Creates pending suggestions for founder <> investor and founder <> lender
 * pairs that exceed the minimum match score. Ranks globally, then applies
 * per-side and global caps so the Suggestions tab stays a curated shortlist.
 */
export async function generateIntroMatchSuggestions(
  client: SupabaseClient,
): Promise<GenerateIntroMatchesResult> {
  const startedAt = Date.now();
  const [contacts, existingKeys] = await Promise.all([
    fetchAllContactsForMatching(client),
    loadExistingPairKeys(client),
  ]);

  const founders: ContactForMatch[] = [];
  const investors: ContactForMatch[] = [];
  const lenders: ContactForMatch[] = [];
  for (const c of contacts) {
    const side = contactSide(c);
    if (side === "founder") founders.push(c);
    else if (side === "investor") investors.push(c);
    else if (side === "lender") lenders.push(c);
  }

  const candidates: Candidate[] = [];
  let skippedBelowThreshold = 0;

  const buildPairs = (capitalPool: ContactForMatch[], capitalSide: CapitalSide) => {
    const kind: MatchKind =
      capitalSide === "investor" ? "founder_investor" : "founder_lender";
    for (const f of founders) {
      for (const cap of capitalPool) {
        if (f.id === cap.id) continue;
        const scored = scorePair(f, cap);
        if (scored.score < MIN_SCORE) {
          skippedBelowThreshold += 1;
          continue;
        }
        candidates.push({
          founder: f,
          capital: cap,
          capitalSide,
          kind,
          ...scored,
        });
      }
    }
  };

  buildPairs(investors, "investor");
  buildPairs(lenders, "lender");

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aWarm = Math.max(
      a.founder.relationship_score ?? 0,
      a.capital.relationship_score ?? 0,
    );
    const bWarm = Math.max(
      b.founder.relationship_score ?? 0,
      b.capital.relationship_score ?? 0,
    );
    return bWarm - aWarm;
  });

  let created = 0;
  let skippedDuplicates = 0;
  const perFounder = new Map<string, number>();
  const perCapital = new Map<string, number>();

  for (const cand of candidates) {
    if (created >= GLOBAL_CAP) break;
    const key = pairKey(cand.founder.id, cand.capital.id, cand.kind);
    if (existingKeys.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    const fCount = perFounder.get(cand.founder.id) ?? 0;
    if (fCount >= PER_FOUNDER_CAP) continue;
    const cCount = perCapital.get(cand.capital.id) ?? 0;
    if (cCount >= PER_CAPITAL_CAP) continue;

    const title = buildSuggestionTitle(cand);
    const body = buildSuggestionBody(cand);
    const row = await insertWorkspaceSuggestion(client, {
      title,
      body,
      contact_a_id: cand.founder.id,
      contact_b_id: cand.capital.id,
      kind: cand.kind,
      score: cand.score,
    });
    if (!row) {
      // DB-side dedupe (unique index) caught a race; treat as duplicate.
      skippedDuplicates += 1;
      continue;
    }
    existingKeys.add(key);
    perFounder.set(cand.founder.id, fCount + 1);
    perCapital.set(cand.capital.id, cCount + 1);
    created += 1;
  }

  return {
    created,
    skippedDuplicates,
    skippedBelowThreshold,
    runMs: Date.now() - startedAt,
  };
}
