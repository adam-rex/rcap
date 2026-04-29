import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";

export type IngestAccessVia = "development" | "secret" | "session";

/**
 * Webhooks must use the service-role client (no user session). Logged-in
 * quick-capture uses the cookie-backed client so RLS applies as usual.
 */
export async function getEmailIngestSupabaseClient(
  via: IngestAccessVia,
): Promise<SupabaseClient> {
  if (via === "session") {
    return createServerSupabaseClient();
  }
  const service = tryCreateServiceRoleClient();
  if (service) {
    return service;
  }
  if (via === "development") {
    return createServerSupabaseClient();
  }
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required for email ingest without a signed-in user.",
  );
}
