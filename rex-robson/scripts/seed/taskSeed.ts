import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createRexTasks,
  type ContactRow,
  type MatchRow,
  type RexTaskRow,
} from "./factories";

const DUMMY = "00000000-0000-0000-0000-000000000000";
const CHUNK = 100;

async function deleteAllTasks(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from("rex_tasks").delete().neq("id", DUMMY);
  if (error) throw error;
}

async function insertChunked(
  supabase: SupabaseClient,
  rows: RexTaskRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("rex_tasks").insert(slice);
    if (error) throw error;
  }
}

export type SeedRexTaskOptions = {
  count: number;
  append: boolean;
  matches?: MatchRow[];
  contacts?: ContactRow[];
};

export async function seedRexTasks(
  supabase: SupabaseClient,
  options: SeedRexTaskOptions,
): Promise<RexTaskRow[]> {
  const { count, append, matches = [], contacts = [] } = options;
  if (count <= 0) return [];
  if (!append) {
    await deleteAllTasks(supabase);
  }
  const rows = createRexTasks(count, matches, contacts);
  await insertChunked(supabase, rows);
  return rows;
}
