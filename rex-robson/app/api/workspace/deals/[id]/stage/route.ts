import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  type DealStage,
  moveWorkspaceDealStage,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

function parseTargetStage(
  body: Record<string, unknown>,
): { ok: true; value: DealStage } | { ok: false; error: string } {
  const raw = body.dealStage;
  if (raw === "prospect" || raw === "active" || raw === "matching" || raw === "closed") {
    return { ok: true, value: raw };
  }
  return {
    ok: false,
    error: "dealStage must be one of: prospect, active, matching, closed.",
  };
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const stage = parseTargetStage(parsed.body);
  if (!stage.ok) {
    return NextResponse.json({ error: stage.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await moveWorkspaceDealStage(client, {
      id,
      toStage: stage.value,
    });
    if (!row) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/deals/[id]/stage:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
