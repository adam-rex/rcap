import { NextResponse } from "next/server";
import { generateIntroMatchSuggestions } from "@/lib/data/intro-match-suggestions";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

/**
 * On-demand: scan contacts for founder ↔ investor pairs in overlapping sectors and insert pending suggestions.
 */
export async function POST() {
  try {
    const client = await getWorkspaceWriteClient();
    const result = await generateIntroMatchSuggestions(client);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "generate_matches_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
