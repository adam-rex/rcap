import type { SupabaseClient } from "@supabase/supabase-js";
import { insertWorkspaceSuggestion } from "@/lib/data/workspace-mutations";

const PAIR_TAG_PREFIX = "rex_match_pair:v1:";

type ContactForMatch = {
  id: string;
  name: string;
  contact_type: string | null;
  sector: string | null;
  sectors: string[] | null;
  role: string | null;
};

function founderInvestorSide(c: ContactForMatch): "founder" | "investor" | null {
  const t = (c.contact_type ?? "").toLowerCase();
  const r = (c.role ?? "").toLowerCase();
  const typeHit = (s: string) => t.includes(s) || r.includes(s);
  if (typeHit("founder")) return "founder";
  if (typeHit("investor")) return "investor";
  return null;
}

function sectorSet(c: ContactForMatch): Set<string> {
  const s = new Set<string>();
  if (c.sector?.trim()) s.add(c.sector.trim().toLowerCase());
  for (const x of c.sectors ?? []) {
    const v = String(x).trim().toLowerCase();
    if (v) s.add(v);
  }
  return s;
}

function sectorsOverlap(a: ContactForMatch, b: ContactForMatch): boolean {
  const A = sectorSet(a);
  const B = sectorSet(b);
  if (A.size === 0 || B.size === 0) return false;
  for (const x of A) {
    if (B.has(x)) return true;
  }
  return false;
}

function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join(":");
}

async function loadExistingPairKeys(
  client: SupabaseClient,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data, error } = await client
    .from("suggestions")
    .select("body")
    .eq("status", "pending")
    .ilike("body", `${PAIR_TAG_PREFIX}%`);
  if (error) throw error;
  for (const row of data ?? []) {
    const body = row.body == null ? "" : String(row.body);
    const line = body.split("\n")[0]?.trim() ?? "";
    if (!line.startsWith(PAIR_TAG_PREFIX)) continue;
    const rest = line.slice(PAIR_TAG_PREFIX.length);
    if (rest.includes(":")) keys.add(rest);
  }
  return keys;
}

async function fetchAllContactsForMatching(
  client: SupabaseClient,
): Promise<ContactForMatch[]> {
  const pageSize = 1000;
  const out: ContactForMatch[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("contacts")
      .select("id,name,contact_type,sector,sectors,role")
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

const MAX_NEW_SUGGESTIONS_PER_RUN = 500;

/**
 * Creates pending suggestions for founder ↔ investor pairs that share at least one sector label.
 */
export async function generateIntroMatchSuggestions(
  client: SupabaseClient,
): Promise<{ created: number; skippedDuplicates: number }> {
  const [contacts, existingKeys] = await Promise.all([
    fetchAllContactsForMatching(client),
    loadExistingPairKeys(client),
  ]);

  const founders: ContactForMatch[] = [];
  const investors: ContactForMatch[] = [];
  for (const c of contacts) {
    const side = founderInvestorSide(c);
    if (side === "founder") founders.push(c);
    else if (side === "investor") investors.push(c);
  }

  let created = 0;
  let skippedDuplicates = 0;

  outer: for (const f of founders) {
    for (const inv of investors) {
      if (created >= MAX_NEW_SUGGESTIONS_PER_RUN) break outer;
      if (f.id === inv.id) continue;
      if (!sectorsOverlap(f, inv)) continue;
      const pk = pairKey(f.id, inv.id);
      if (existingKeys.has(pk)) {
        skippedDuplicates += 1;
        continue;
      }

      const overlapLabels = [...sectorSet(f)].filter((x) =>
        sectorSet(inv).has(x),
      );
      const sectorLabel =
        overlapLabels[0]?.replace(/\b\w/g, (ch) => ch.toUpperCase()) ??
        "Shared sector";

      const title = `Intro: ${f.name} ↔ ${inv.name} (${sectorLabel})`;
      const tag = `${PAIR_TAG_PREFIX}${pk}`;
      const body = [
        tag,
        "",
        `Potential intro: **${f.name}** (founder-side) and **${inv.name}** (investor-side) both touch **${sectorLabel}**.`,
        "",
        `Review fit and warm paths before connecting.`,
      ].join("\n");

      await insertWorkspaceSuggestion(client, { title, body });
      existingKeys.add(pk);
      created += 1;
    }
  }

  return { created, skippedDuplicates };
}
