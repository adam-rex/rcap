import { NextResponse } from "next/server";
import { getWorkspaceOpportunities } from "@/lib/data/workspace-opportunities-page";
import { supabaseErrorSummary } from "@/lib/data/supabase-error-guards";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await getWorkspaceOpportunities();
    return NextResponse.json({ rows });
  } catch (e) {
    const message = supabaseErrorSummary(e);
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/opportunities:", message, e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
