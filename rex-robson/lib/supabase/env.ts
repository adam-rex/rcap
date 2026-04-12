function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) in .env.local.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required(
    "Supabase URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );
}

/** Use the anon (public) key in the browser and for user-scoped server calls with RLS. */
export function getSupabaseAnonKey(): string {
  return required(
    "Supabase anon key",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
  );
}
