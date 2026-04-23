import { NextResponse } from "next/server";
import {
  getWorkspaceTasksPage,
  WORKSPACE_TASKS_PAGE_SIZE_DEFAULT,
  WORKSPACE_TASKS_PAGE_SIZE_MAX,
  fetchWorkspaceTaskByIdWithClient,
} from "@/lib/data/workspace-tasks";
import {
  getWorkspaceWriteClient,
  insertWorkspaceTask,
  markWorkspaceTaskDone,
  markWorkspaceTaskFailed,
  markWorkspaceTaskRunning,
} from "@/lib/data/workspace-mutations";
import {
  WORKSPACE_TASK_TYPE_LABELS,
  WORKSPACE_TASK_TYPE_REQUIRES_MATCH,
  type WorkspaceTaskRow,
  type WorkspaceTaskSource,
  type WorkspaceTaskType,
} from "@/lib/data/workspace-tasks.types";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  extractDbErrorMessage,
  looksLikeMissingColumn,
} from "@/lib/api/db-errors";
import { getTaskExecutor } from "@/lib/rex/task-executors";

export const runtime = "nodejs";
export const maxDuration = 60;

type ParsedTaskBody = {
  title: string;
  detail: string | null;
  source: WorkspaceTaskSource;
  due_at: string | null;
  task_type: WorkspaceTaskType;
  prompt: string | null;
  match_id: string | null;
  contact_id: string | null;
  autoRun: boolean;
};

function readTaskCreateBody(
  body: unknown,
): { ok: true; value: ParsedTaskBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be an object." };
  }
  const o = body as Record<string, unknown>;

  const typeRaw = o.taskType ?? o.task_type;
  const task_type: WorkspaceTaskType =
    typeRaw === "draft_intro_email" ||
    typeRaw === "compile_match_brief" ||
    typeRaw === "research_counterparty" ||
    typeRaw === "summarise_call_notes" ||
    typeRaw === "custom"
      ? typeRaw
      : "custom";

  const titleRaw = typeof o.title === "string" ? o.title.trim() : "";
  const promptRaw = typeof o.prompt === "string" ? o.prompt.trim() : "";
  const detailRaw = typeof o.detail === "string" ? o.detail.trim() : "";

  // Templates can auto-title from the task type; custom requires either a title
  // or a prompt (we'll derive a title from the prompt if needed).
  let title = titleRaw;
  if (!title) {
    if (task_type === "custom") {
      if (!promptRaw) {
        return {
          ok: false,
          error: "Custom tasks need either a title or a prompt.",
        };
      }
      const firstLine = promptRaw.split("\n")[0] ?? promptRaw;
      title =
        firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
    } else {
      title = WORKSPACE_TASK_TYPE_LABELS[task_type];
    }
  }

  const detail = detailRaw.length > 0 ? detailRaw : null;
  const prompt = promptRaw.length > 0 ? promptRaw : null;

  const sourceRaw = o.source;
  const source: WorkspaceTaskSource =
    sourceRaw === "manual" ||
    sourceRaw === "meeting_note" ||
    sourceRaw === "email" ||
    sourceRaw === "import"
      ? sourceRaw
      : "manual";

  const dueRaw = o.dueAt;
  const due_at =
    typeof dueRaw === "string" && dueRaw.trim() ? dueRaw.trim() : null;

  const matchRaw = o.matchId ?? o.match_id;
  let match_id: string | null = null;
  if (typeof matchRaw === "string" && matchRaw.trim()) {
    const t = matchRaw.trim();
    if (!isValidUuid(t)) {
      return { ok: false, error: "matchId must be a valid UUID." };
    }
    match_id = t;
  }

  const contactRaw = o.contactId ?? o.contact_id;
  let contact_id: string | null = null;
  if (typeof contactRaw === "string" && contactRaw.trim()) {
    const t = contactRaw.trim();
    if (!isValidUuid(t)) {
      return { ok: false, error: "contactId must be a valid UUID." };
    }
    contact_id = t;
  }

  if (WORKSPACE_TASK_TYPE_REQUIRES_MATCH[task_type] && !match_id) {
    return {
      ok: false,
      error: `${WORKSPACE_TASK_TYPE_LABELS[task_type]} requires a matchId.`,
    };
  }

  // Custom tasks always need a prompt — that's what the LLM runs on.
  if (task_type === "custom" && !prompt) {
    return { ok: false, error: "Custom tasks require a prompt." };
  }

  const autoRunRaw = o.autoRun ?? o.run;
  // Default: templates auto-run, custom does not (safety: it's free-text).
  const autoRunDefault = task_type !== "custom";
  const autoRun =
    typeof autoRunRaw === "boolean" ? autoRunRaw : autoRunDefault;

  return {
    ok: true,
    value: {
      title,
      detail,
      source,
      due_at,
      task_type,
      prompt,
      match_id,
      contact_id,
      autoRun,
    },
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = url.searchParams.get("page");
  const sizeRaw = url.searchParams.get("pageSize") ?? url.searchParams.get("limit");
  const statusRaw = url.searchParams.get("status");
  const matchIdRaw = url.searchParams.get("matchId");
  const contactIdRaw = url.searchParams.get("contactId");

  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const pageSize = sizeRaw
    ? Number.parseInt(sizeRaw, 10)
    : WORKSPACE_TASKS_PAGE_SIZE_DEFAULT;
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (
    !Number.isFinite(pageSize) ||
    pageSize < 1 ||
    pageSize > WORKSPACE_TASKS_PAGE_SIZE_MAX
  ) {
    return NextResponse.json(
      { error: `pageSize must be 1–${WORKSPACE_TASKS_PAGE_SIZE_MAX}` },
      { status: 400 },
    );
  }

  const matchId = matchIdRaw && isValidUuid(matchIdRaw) ? matchIdRaw : null;
  const contactId =
    contactIdRaw && isValidUuid(contactIdRaw) ? contactIdRaw : null;

  try {
    const result = await getWorkspaceTasksPage({
      page,
      pageSize,
      status: statusRaw,
      matchId,
      contactId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = extractDbErrorMessage(e, "Query failed");
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] GET /api/workspace/tasks:", e);
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

async function runTaskInline(
  client: Awaited<ReturnType<typeof getWorkspaceWriteClient>>,
  created: WorkspaceTaskRow,
): Promise<WorkspaceTaskRow> {
  await markWorkspaceTaskRunning(client, created.id);
  const fresh =
    (await fetchWorkspaceTaskByIdWithClient(client, created.id)) ?? created;
  try {
    const executor = getTaskExecutor(fresh.taskType);
    const result = await executor.run({ supabase: client, task: fresh });
    const row = await markWorkspaceTaskDone(client, fresh.id, {
      text: result.text,
      format: result.format,
    });
    return row ?? fresh;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Executor failed";
    const failed = await markWorkspaceTaskFailed(client, fresh.id, message);
    return failed ?? { ...fresh, status: "failed", error: message };
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = readTaskCreateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const created = await insertWorkspaceTask(client, parsed.value);

    if (!parsed.value.autoRun) {
      return NextResponse.json(created, { status: 201 });
    }

    const finalRow = await runTaskInline(client, created);
    return NextResponse.json(finalRow, { status: 201 });
  } catch (e) {
    const message = extractDbErrorMessage(e, "Insert failed");
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] POST /api/workspace/tasks:", e);
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
