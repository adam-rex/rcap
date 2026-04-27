import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  getWorkspaceWriteClient,
  updateWorkspaceMatchIntroduction,
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
  const body = parsed.body as Record<string, unknown>;
  const atRaw = body.introductionAt;
  const notesRaw = body.introductionNotes;
  const introduction_at =
    atRaw === null || atRaw === undefined
      ? null
      : typeof atRaw === "string" && atRaw.trim() !== ""
        ? new Date(atRaw).toISOString()
        : null;
  const introduction_notes =
    notesRaw === null || notesRaw === undefined
      ? null
      : typeof notesRaw === "string"
        ? notesRaw.trim() === ""
          ? null
          : notesRaw.trim()
        : null;

  if (introduction_at != null && Number.isNaN(Date.parse(introduction_at))) {
    return NextResponse.json({ error: "Invalid introductionAt" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await updateWorkspaceMatchIntroduction(client, id, {
      introduction_at,
      introduction_notes,
    });
    if (!row) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] PATCH /api/workspace/matches/[id]/introduction:",
        e,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
