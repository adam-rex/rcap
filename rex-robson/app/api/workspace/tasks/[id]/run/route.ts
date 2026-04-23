import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  extractDbErrorMessage,
  looksLikeMissingColumn,
} from "@/lib/api/db-errors";
import { fetchWorkspaceTaskByIdWithClient } from "@/lib/data/workspace-tasks";
import {
  getWorkspaceWriteClient,
  markWorkspaceTaskDone,
  markWorkspaceTaskFailed,
  markWorkspaceTaskRunning,
} from "@/lib/data/workspace-mutations";
import { getTaskExecutor } from "@/lib/rex/task-executors";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Runs the task's executor end-to-end: flips status -> running, invokes the
 * LLM, then writes output + completed_at. On failure we persist the error
 * message and the task lands in the 'failed' bucket so the user can retry.
 */
export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const existing = await fetchWorkspaceTaskByIdWithClient(client, id);
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (existing.status === "running") {
      return NextResponse.json(
        { error: "Task is already running. Wait for it to finish before retrying." },
        { status: 409 },
      );
    }

    await markWorkspaceTaskRunning(client, id);
    // Re-read so the executor sees the `running` snapshot (and any fresh joins).
    const taskForRun =
      (await fetchWorkspaceTaskByIdWithClient(client, id)) ?? existing;

    try {
      const executor = getTaskExecutor(taskForRun.taskType);
      const result = await executor.run({ supabase: client, task: taskForRun });
      const row = await markWorkspaceTaskDone(client, id, {
        text: result.text,
        format: result.format,
      });
      return NextResponse.json(row);
    } catch (runErr) {
      const message = extractDbErrorMessage(runErr, "Executor failed");
      if (process.env.NODE_ENV !== "production") {
        console.error("[rex-robson] Task executor failed:", runErr);
      }
      const row = await markWorkspaceTaskFailed(client, id, message);
      return NextResponse.json(
        { error: message, row },
        { status: 502 },
      );
    }
  } catch (e) {
    const message = extractDbErrorMessage(e, "Run failed");
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] POST /api/workspace/tasks/[id]/run:", e);
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
