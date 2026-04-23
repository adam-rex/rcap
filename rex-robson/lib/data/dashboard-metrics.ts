import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ZERO_DASHBOARD_METRICS,
  ZERO_MATCHES_BY_STAGE,
  type DashboardMetrics,
  type MatchStage,
  type MatchesByStage,
  type SectorBreakdownEntry,
} from "./dashboard-metrics.types";

export { ZERO_DASHBOARD_METRICS, type DashboardMetrics };

/**
 * Aggregates for the home dashboard. Uses the service-role client when available so counts work
 * before auth is wired; falls back to the cookie-backed client (RLS + session) otherwise.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;

  const thirtyDaysAgoIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const contactsTotalReq = client
      .from("contacts")
      .select("*", { count: "exact", head: true });

    const contactsNew30dReq = client
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgoIso);

    // For sector breakdown we join on contact_a so each match contributes one
    // sector (the founder side, by convention). We also pull min/max deal size
    // from both sides so we can derive an implied per-match deal value for the
    // total pipeline tile.
    const matchRowsReq = client
      .from("matches")
      .select(
        "stage," +
          "contact_a:contacts!matches_contact_a_id_fkey(sector,min_deal_size,max_deal_size)," +
          "contact_b:contacts!matches_contact_b_id_fkey(min_deal_size,max_deal_size)",
      );

    const suggestionsPendingReq = client
      .from("suggestions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const [
      { count: contactCount, error: e1 },
      { count: contactsNew30d, error: e2 },
      { data: matchRows, error: e3 },
      { count: suggestionsPendingCount, error: e4 },
    ] = await Promise.all([
      contactsTotalReq,
      contactsNew30dReq,
      matchRowsReq,
      suggestionsPendingReq,
    ]);

    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;

    const matchesByStage: MatchesByStage = { ...ZERO_MATCHES_BY_STAGE };
    let activeMatchesCount = 0;
    let totalPipelineGbp = 0;
    const sectorAgg = new Map<string, { count: number; value: number }>();
    let sectorUnknownCount = 0;
    let sectorTotalCount = 0;

    for (const raw of matchRows ?? []) {
      const row = raw as unknown as {
        stage: string | null;
        contact_a:
          | {
              sector: string | null;
              min_deal_size: number | null;
              max_deal_size: number | null;
            }
          | null;
        contact_b:
          | {
              min_deal_size: number | null;
              max_deal_size: number | null;
            }
          | null;
      };
      const stage = row.stage;
      if (stage === "introduced" || stage === "active" || stage === "closed") {
        matchesByStage[stage as MatchStage] += 1;
        if (stage === "active") activeMatchesCount += 1;
      }

      // Sector breakdown is scoped to open matches (introduced + active) so the chart
      // shows where live opportunity sits today.
      const isOpen = stage !== "closed";
      if (!isOpen) continue;

      totalPipelineGbp += impliedMatchValueGbp(row.contact_a, row.contact_b);

      sectorTotalCount += 1;
      const sectorName = (row.contact_a?.sector ?? "").trim();
      if (!sectorName) {
        sectorUnknownCount += 1;
        continue;
      }
      const existing = sectorAgg.get(sectorName);
      if (existing) {
        existing.count += 1;
      } else {
        sectorAgg.set(sectorName, { count: 1, value: 0 });
      }
    }

    const matchesBySector: SectorBreakdownEntry[] = Array.from(
      sectorAgg.entries(),
    )
      .map(([sector, { count, value }]) => ({ sector, count, value }))
      .sort((a, b) => b.count - a.count);

    const openMatchCount =
      matchesByStage.introduced + matchesByStage.active;

    return {
      contactCount: contactCount ?? 0,
      contactsNew30d: contactsNew30d ?? 0,
      openMatchCount,
      totalPipelineGbp,
      matchesByStage,
      matchesBySector,
      sectorTotalCount,
      sectorUnknownCount,
      activeMatchesCount,
      pendingSuggestionsCount: suggestionsPendingCount ?? 0,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] getDashboardMetrics failed:", err);
    }
    return ZERO_DASHBOARD_METRICS;
  }
}

type DealRange = {
  min_deal_size: number | null;
  max_deal_size: number | null;
} | null;

/**
 * Implied £ deal value for a single match. Matches don't store an explicit
 * deal size, so we derive one from the founder/capital min–max ranges:
 *   1. If the two ranges overlap, take the midpoint of that overlap.
 *   2. Otherwise fall back to the smaller of the two range midpoints (the
 *      tighter side caps what could realistically clear).
 *   3. If only one side has data, use its midpoint; if neither side does,
 *      this match contributes 0 to the pipeline total.
 */
function impliedMatchValueGbp(a: DealRange, b: DealRange): number {
  const aRange = normaliseRange(a);
  const bRange = normaliseRange(b);
  if (!aRange && !bRange) return 0;
  if (!aRange) return midpoint(bRange!);
  if (!bRange) return midpoint(aRange);

  const overlapLow = Math.max(aRange.low, bRange.low);
  const overlapHigh = Math.min(aRange.high, bRange.high);
  if (overlapLow <= overlapHigh) {
    return (overlapLow + overlapHigh) / 2;
  }
  return Math.min(midpoint(aRange), midpoint(bRange));
}

function normaliseRange(
  r: DealRange,
): { low: number; high: number } | null {
  if (!r) return null;
  const min = typeof r.min_deal_size === "number" ? r.min_deal_size : null;
  const max = typeof r.max_deal_size === "number" ? r.max_deal_size : null;
  if (min == null && max == null) return null;
  const low = min ?? max ?? 0;
  const high = max ?? min ?? 0;
  return low <= high ? { low, high } : { low: high, high: low };
}

function midpoint(r: { low: number; high: number }): number {
  return (r.low + r.high) / 2;
}
