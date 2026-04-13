import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

function readServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Server-only client that bypasses RLS. Use for trusted aggregates (e.g. homepage counts)
 * when no user session exists yet. Returns null if no service role key is set.
 *
 * Prefer `SUPABASE_SERVICE_ROLE_KEY` only — never ship `NEXT_PUBLIC_*` service keys to production.
 */
export function tryCreateServiceRoleClient(): SupabaseClient | null {
  const key = readServiceRoleKey();
  if (!key) return null;
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.warn(
      "[rex-robson] Using NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY. Rename to SUPABASE_SERVICE_ROLE_KEY so the key is not exposed to the browser bundle.",
    );
  }
  return createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
