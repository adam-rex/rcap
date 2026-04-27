import { NextResponse } from "next/server";
import { parseMatchTransactionStageBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  moveWorkspaceMatchTransactionStage,
} from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const stage = parseMatchTransactionStageBody(parsed.body);
  if (!stage.ok) {
    return NextResponse.json({ error: stage.error }, { status: 400 });
  }
  if (stage.value.stage === "closed" && stage.value.outcome == null) {
    return NextResponse.json(
      { error: "outcome is required when stage is closed." },
      { status: 400 },
    );
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await moveWorkspaceMatchTransactionStage(client, {
      id,
      toStage: stage.value.stage,
      outcome: stage.value.outcome,
    });
    if (!row) {
      return NextResponse.json(
        { error: "Transaction not found or missing outcome for close." },
        { status: 404 },
      );
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage update failed";
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] PATCH /api/workspace/match-transactions/[id]/stage:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
