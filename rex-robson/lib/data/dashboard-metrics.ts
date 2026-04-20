import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ZERO_DASHBOARD_METRICS,
  type DashboardMetrics,
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

    const [
      { count: contactCount, error: e1 },
      { count: contactsNew30d, error: e2 },
      { count: openDealCount, error: e3 },
      { data: sizesData, error: e4 },
    ] = await Promise.all([
      contactsTotalReq,
      contactsNew30dReq,
      openDealsCountReq,
      openDealSizesReq,
    ]);

    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;

    const sizes = (sizesData ?? [])
      .map((row) => (row as { size: number | null }).size)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

    const openPipelineValue = sizes.reduce((sum, n) => sum + n, 0);
    const avgDealSize = sizes.length > 0 ? openPipelineValue / sizes.length : null;

    return {
      contactCount: contactCount ?? 0,
      contactsNew30d: contactsNew30d ?? 0,
      openDealCount: openDealCount ?? 0,
      openPipelineValue,
      avgDealSize,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] getDashboardMetrics failed:", err);
    }
    return ZERO_DASHBOARD_METRICS;
  }
}
