import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  undoMatchIntroduction,
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
    const result = await undoMatchIntroduction(client, id);
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "has_transactions"
            ? 409
            : 422;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Undo failed";
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] POST /api/workspace/matches/[id]/undo-introduction:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
