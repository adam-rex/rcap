import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ZERO_DASHBOARD_METRICS,
  ZERO_MATCHES_BY_STAGE,
  type DashboardMetrics,
  type MatchesByStage,
  type SectorBreakdownEntry,
} from "./dashboard-metrics.types";
import {
  isMissingMatchTransactionsError,
  supabaseErrorSummary,
} from "./supabase-error-guards";

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

    const opportunitiesIntroducedReq = client
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("stage", "introduced");

    // Active pipeline £ total is scoped to open deal rows (transactions), not the whole pair.
    const transactionRowsReq = client
      .from("match_transactions")
      .select(
        "stage," +
          "match:matches!inner(" +
            "contact_a:contacts!matches_contact_a_id_fkey(min_deal_size,max_deal_size)," +
            "contact_b:contacts!matches_contact_b_id_fkey(min_deal_size,max_deal_size)" +
          ")",
      );

    // Sector breakdown aggregates across the entire contact pool. This is
    // more useful than scoping to open matches: it tells you where your
    // network sits, not just where live deals are today.
    const contactSectorsReq = client.from("contacts").select("sector");

    const suggestionsPendingReq = client
      .from("suggestions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const [
      { count: contactCount, error: e1 },
      { count: contactsNew30d, error: e2 },
      { count: opportunitiesIntroducedCount, error: e3a },
      { data: transactionRows, error: e3 },
      { data: contactSectorRows, error: e4 },
      { count: suggestionsPendingCount, error: e5 },
    ] = await Promise.all([
      contactsTotalReq,
      contactsNew30dReq,
      opportunitiesIntroducedReq,
      transactionRowsReq,
      contactSectorsReq,
      suggestionsPendingReq,
    ]);

    if (e1) throw e1;
    if (e2) throw e2;
    if (e3a) throw e3a;
    if (e4) throw e4;
    if (e5) throw e5;

    let txRows = transactionRows ?? [];
    if (e3) {
      if (isMissingMatchTransactionsError(e3)) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[rex-robson] getDashboardMetrics: match_transactions missing or not exposed — pipeline tiles use 0. Run Supabase migrations (e.g. 20260427150000_match_transactions.sql).",
            supabaseErrorSummary(e3),
          );
        }
        txRows = [];
      } else {
        throw e3;
      }
    }

    const matchesByStage: MatchesByStage = { ...ZERO_MATCHES_BY_STAGE };
    matchesByStage.introduced = opportunitiesIntroducedCount ?? 0;

    let activeMatchesCount = 0;
    let totalPipelineGbp = 0;

    for (const raw of txRows) {
      const row = raw as unknown as {
        stage: string | null;
        match: {
          contact_a:
            | {
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
        } | null;
      };
      const stage = row.stage;
      const m = row.match;
      if (stage === "active") {
        matchesByStage.active += 1;
        activeMatchesCount += 1;
        totalPipelineGbp += impliedMatchValueGbp(
          m?.contact_a ?? null,
          m?.contact_b ?? null,
        );
      } else if (stage === "closed") {
        matchesByStage.closed += 1;
      }
    }

    const sectorAgg = new Map<string, number>();
    let sectorUnknownCount = 0;
    let sectorContactCount = 0;

    for (const raw of contactSectorRows ?? []) {
      const row = raw as unknown as { sector: string | null };
      sectorContactCount += 1;
      const sectorName = (row.sector ?? "").trim();
      if (!sectorName) {
        sectorUnknownCount += 1;
        continue;
      }
      sectorAgg.set(sectorName, (sectorAgg.get(sectorName) ?? 0) + 1);
    }

    const contactsBySector: SectorBreakdownEntry[] = Array.from(
      sectorAgg.entries(),
    )
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);

    const openMatchCount =
      matchesByStage.introduced + matchesByStage.active;

    return {
      contactCount: contactCount ?? 0,
      contactsNew30d: contactsNew30d ?? 0,
      openMatchCount,
      totalPipelineGbp,
      matchesByStage,
      contactsBySector,
      sectorContactCount,
      sectorUnknownCount,
      activeMatchesCount,
      pendingSuggestionsCount: suggestionsPendingCount ?? 0,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] getDashboardMetrics failed:",
        supabaseErrorSummary(err),
        err,
      );
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
