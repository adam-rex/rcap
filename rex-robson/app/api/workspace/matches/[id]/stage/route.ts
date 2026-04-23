import { NextResponse } from "next/server";
import { parseMatchStageBody } from "@/lib/api/workspace-entity-bodies";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  moveWorkspaceMatchStage,
} from "@/lib/data/workspace-mutations";

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
  const stage = parseMatchStageBody(parsed.body);
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
    const row = await moveWorkspaceMatchStage(client, {
      id,
      toStage: stage.value.stage,
      outcome: stage.value.outcome,
    });
    if (!row) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage update failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH /api/workspace/matches/[id]/stage:", e);
    }
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        {
          error:
            "Another open match already exists for this pair. Close it first.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
