import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import type { RexDashboardStats } from "@/lib/rex/voice";
import {
  isMissingMatchTransactionsError,
  supabaseErrorSummary,
} from "./supabase-error-guards";

/**
 * Loads aggregate counts for the Rex greeting. Prefers service role on the server so counts work
 * before auth is wired; falls back to the cookie-backed client (RLS + session).
 */
export async function getRexDashboardStats(): Promise<RexDashboardStats> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;

  if (process.env.NODE_ENV === "development" && !service) {
    console.warn(
      "[rex-robson] Supabase: no service role key. Server reads use the anon key; RLS only allows the authenticated role, so counts stay at 0 until you sign in or set SUPABASE_SERVICE_ROLE_KEY in .env.local (restart dev server).",
    );
  }

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
