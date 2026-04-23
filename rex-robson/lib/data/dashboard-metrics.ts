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

    // For sector breakdown we join on contact_a so each match contributes one sector
    // (the founder side, by convention). Pull the open matches only.
    const matchRowsReq = client
      .from("matches")
      .select(
        "stage,contact_a:contacts!matches_contact_a_id_fkey(sector)",
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
    const sectorAgg = new Map<string, { count: number; value: number }>();
    let sectorUnknownCount = 0;
    let sectorTotalCount = 0;

    for (const raw of matchRows ?? []) {
      const row = raw as unknown as {
        stage: string | null;
        contact_a: { sector: string | null } | null;
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
