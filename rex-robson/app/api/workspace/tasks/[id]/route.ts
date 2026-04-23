import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  extractDbErrorMessage,
  looksLikeMissingColumn,
} from "@/lib/api/db-errors";
import { fetchWorkspaceTaskByIdWithClient } from "@/lib/data/workspace-tasks";
import {
  getWorkspaceWriteClient,
  updateWorkspaceTaskStatus,
} from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const client = await getWorkspaceWriteClient();
    const row = await fetchWorkspaceTaskByIdWithClient(client, id);
    if (!row) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = extractDbErrorMessage(e, "Query failed");
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] GET /api/workspace/tasks/[id]:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint: looksLikeMissingColumn(message)
          ? "Apply scripts/apply-rex-tasks-scope.sql to your Supabase project (SQL Editor) and retry."
          : undefined,
      },
      { status: 503 },
    );
  }
}

/**
 * PATCH only supports lightweight status transitions a human initiates:
 *   - "dismiss" (status -> dismissed)
 *   - "reset"   (status -> pending; clears completed_at + error)
 * Running a task is a dedicated endpoint (POST /run) so it can't accidentally
 * happen via JSON-PATCH-style flows.
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const actionRaw = parsed.body.action;
  const action = typeof actionRaw === "string" ? actionRaw : "";
  const target =
    action === "dismiss"
      ? ("dismissed" as const)
      : action === "reset"
        ? ("pending" as const)
        : null;
  if (!target) {
    return NextResponse.json(
      { error: "action must be 'dismiss' or 'reset'" },
      { status: 400 },
    );
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceTaskByIdWithClient(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const row = await updateWorkspaceTaskStatus(client, id, target);
    return NextResponse.json(row);
  } catch (e) {
    const message = extractDbErrorMessage(e, "Update failed");
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] PATCH /api/workspace/tasks/[id]:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
