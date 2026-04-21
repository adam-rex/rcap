import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ZERO_DASHBOARD_METRICS,
  ZERO_DEALS_BY_STAGE,
  type DashboardMetrics,
  type DealStage,
  type DealsByStage,
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

    const openDealsCountReq = client
      .from("deals")
      .select("*", { count: "exact", head: true })
      .or("status.is.null,status.not.in.(passed,closed)");

    const openDealSizesReq = client
      .from("deals")
      .select("size")
      .or("status.is.null,status.not.in.(passed,closed)");

    const dealStageRowsReq = client
      .from("deals")
      .select("deal_stage, size, sector, status");

    const suggestionsPendingReq = client
      .from("suggestions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const [
      { count: contactCount, error: e1 },
      { count: contactsNew30d, error: e2 },
      { count: openDealCount, error: e3 },
      { data: sizesData, error: e4 },
      { data: stageRows, error: e5 },
      { count: suggestionsPendingCount, error: e6 },
    ] = await Promise.all([
      contactsTotalReq,
      contactsNew30dReq,
      openDealsCountReq,
      openDealSizesReq,
      dealStageRowsReq,
      suggestionsPendingReq,
    ]);

    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    if (e5) throw e5;
    if (e6) throw e6;

    const sizes = (sizesData ?? [])
      .map((row) => (row as { size: number | null }).size)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

    const openPipelineValue = sizes.reduce((sum, n) => sum + n, 0);
    const avgDealSize = sizes.length > 0 ? openPipelineValue / sizes.length : null;

    const dealsByStage: DealsByStage = { ...ZERO_DEALS_BY_STAGE };
    let matchingCount = 0;
    let matchingValue = 0;
    const sectorAgg = new Map<string, { count: number; value: number }>();
    let sectorUnknownCount = 0;
    let sectorTotalCount = 0;
    for (const raw of stageRows ?? []) {
      const row = raw as {
        deal_stage: string | null;
        size: number | null;
        sector: string | null;
        status: string | null;
      };
      const stage = row.deal_stage;
      if (
        stage === "prospect" ||
        stage === "active" ||
        stage === "matching" ||
        stage === "closed"
      ) {
        dealsByStage[stage as DealStage] += 1;
        if (stage === "matching") {
          matchingCount += 1;
          if (typeof row.size === "number" && Number.isFinite(row.size)) {
            matchingValue += row.size;
          }
        }
      }

      // Sector breakdown is scoped to the open pipeline (mirrors the
      // "open deal" metrics above): exclude passed/closed so the chart
      // shows where active opportunity sits today.
      const isOpen = row.status !== "passed" && row.status !== "closed";
      if (!isOpen) continue;
      sectorTotalCount += 1;
      const sectorName = (row.sector ?? "").trim();
      if (!sectorName) {
        sectorUnknownCount += 1;
        continue;
      }
      const size =
        typeof row.size === "number" && Number.isFinite(row.size)
          ? row.size
          : 0;
      const existing = sectorAgg.get(sectorName);
      if (existing) {
        existing.count += 1;
        existing.value += size;
      } else {
        sectorAgg.set(sectorName, { count: 1, value: size });
      }
    }

    const dealsBySector: SectorBreakdownEntry[] = Array.from(sectorAgg.entries())
      .map(([sector, { count, value }]) => ({ sector, count, value }))
      .sort((a, b) =>
        b.count !== a.count ? b.count - a.count : b.value - a.value,
      );

    return {
      contactCount: contactCount ?? 0,
      contactsNew30d: contactsNew30d ?? 0,
      openDealCount: openDealCount ?? 0,
      openPipelineValue,
      avgDealSize,
      dealsByStage,
      dealsBySector,
      sectorTotalCount,
      sectorUnknownCount,
      matchingCount,
      matchingValue,
      suggestionsPendingCount: suggestionsPendingCount ?? 0,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] getDashboardMetrics failed:", err);
    }
    return ZERO_DASHBOARD_METRICS;
  }
}
