import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RexDashboardStats } from "@/lib/rex/voice";
import {
  isMissingMatchTransactionsError,
  supabaseErrorSummary,
} from "./supabase-error-guards";

/**
 * Loads aggregate counts for the Rex greeting (cookie session + RLS).
 */
export async function getRexDashboardStats(): Promise<RexDashboardStats> {
  const client = await createServerSupabaseClient();
  try {
    const contactsReq = client
      .from("contacts")
      .select("*", { count: "exact", head: true });

    const organisationsReq = client
      .from("organisations")
      .select("*", { count: "exact", head: true });

    const opportunitiesReq = client
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("stage", "introduced");

    const activePipelineReq = client
      .from("match_transactions")
      .select("*", { count: "exact", head: true })
      .eq("stage", "active");

    const suggestionsPendingReq = client
      .from("suggestions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const suggestionsTotalReq = client
      .from("suggestions")
      .select("*", { count: "exact", head: true });

    const [
      { count: contactCount, error: e1 },
      { count: organisationCount, error: e1b },
      { count: opportunitiesCount, error: e2 },
      { count: activeTxCount, error: e2b },
      { count: suggestionsPendingCount, error: e3 },
      { count: suggestionTotalCount, error: e4 },
    ] = await Promise.all([
      contactsReq,
      organisationsReq,
      opportunitiesReq,
      activePipelineReq,
      suggestionsPendingReq,
      suggestionsTotalReq,
    ]);

    if (e1) throw e1;
    if (e1b) throw e1b;
    if (e2) throw e2;
    const pipelineTxMissing = Boolean(
      e2b && isMissingMatchTransactionsError(e2b),
    );
    if (e2b && !pipelineTxMissing) throw e2b;
    if (pipelineTxMissing && process.env.NODE_ENV === "development") {
      console.warn(
        "[rex-robson] getRexDashboardStats: match_transactions unavailable — active deal count is 0 until migrations are applied.",
        supabaseErrorSummary(e2b),
      );
    }
    if (e3) throw e3;
    if (e4) throw e4;

    const opportunitiesN = opportunitiesCount ?? 0;
    const activeDealsN = pipelineTxMissing ? 0 : (activeTxCount ?? 0);

    return {
      contactCount: contactCount ?? 0,
      organisationCount: organisationCount ?? 0,
      openMatchCount: opportunitiesN + activeDealsN,
      activeMatchCount: activeDealsN,
      suggestionsPendingCount: suggestionsPendingCount ?? 0,
      suggestionTotalCount: suggestionTotalCount ?? 0,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] getRexDashboardStats failed:",
        supabaseErrorSummary(err),
        err,
      );
    }
    return {
      contactCount: 0,
      organisationCount: 0,
      openMatchCount: 0,
      activeMatchCount: 0,
      suggestionsPendingCount: 0,
      suggestionTotalCount: 0,
    };
  }
}
