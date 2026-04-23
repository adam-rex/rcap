import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  updateWorkspaceSuggestionStatus,
} from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    await updateWorkspaceSuggestionStatus(client, id, "dismissed");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "dismiss_suggestion_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
