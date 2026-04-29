import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase client for Rex search (cookie session + RLS). */
export async function createSearchSupabaseClient(): Promise<SupabaseClient> {
  return createServerSupabaseClient();
}
