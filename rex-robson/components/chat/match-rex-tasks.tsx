"use client";

import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";
import {
  STATUS_LABEL,
  STATUS_PILL,
  TaskDrawer,
} from "./rex-task-display";
import {
  WORKSPACE_TASK_TYPE_DESCRIPTIONS,
  WORKSPACE_TASK_TYPE_LABELS,
  type WorkspaceTaskRow,
  type WorkspaceTaskType,
} from "@/lib/data/workspace-tasks.types";

type ApiListOk = { rows: WorkspaceTaskRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

const STRIP_LIMIT = 4;

/**
 * Picker options. Match-scoped tasks only; contact-free ones (research /
 * call notes) are still available via the central Tasks tab.
 */
const MATCH_PICKER_TYPES: WorkspaceTaskType[] = [
  "compile_match_brief",
  "draft_intro_email",
  "research_counterparty",
  "summarise_call_notes",
  "custom",
];

export function MatchRexTasks({ matchId }: { matchId: string }) {
  const [rows, setRows] = useState<WorkspaceTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawer, setDrawer] = useState<WorkspaceTaskRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/tasks?matchId=${encodeURIComponent(matchId)}&pageSize=${STRIP_LIMIT}`,
      );
      const data = (await res.json()) as ApiListOk & ApiErr;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        throw new Error(
          parts.join(" — ") || "Could not load Rex tasks.",
        );
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => rows.slice(0, STRIP_LIMIT), [rows]);

  const onCreated = useCallback(
    (created: WorkspaceTaskRow) => {
      setRows((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      if (created.status === "done" || created.status === "failed") {
        setDrawer(created);
      }
      void load();
    },
    [load],
  );

  const onRerun = useCallback(
    async (taskId: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === taskId ? { ...r, status: "running", error: null } : r,
        ),
      );
      setDrawer((d) =>
        d && d.id === taskId ? { ...d, status: "running", error: null } : d,
      );
      try {
        const res = await fetch(
          `/api/workspace/tasks/${encodeURIComponent(taskId)}/run`,
          { method: "POST" },
        );
        const data = await res.json();
        const row: WorkspaceTaskRow | null =
          res.ok && data && typeof data === "object"
            ? (data as WorkspaceTaskRow)
            : (data?.row as WorkspaceTaskRow) ?? null;
        if (row) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          setDrawer((d) => (d && d.id === row.id ? row : d));
        }
      } catch {
        // Leave in running; a reload will reconcile.
      } finally {
        void load();
      }
    },
    [load],
  );

  return (
    <div className="mt-3 border-t border-charcoal/8 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-charcoal-light/75">
          Rex tasks
        </p>
        <button
          type="button"
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-charcoal/15 bg-cream px-2 py-1 text-[10px] font-medium text-charcoal transition-colors hover:bg-charcoal/5"
        >
          <Sparkles className="size-3" aria-hidden />
          Ask Rex to…
        </button>
      </div>
      {loading ? (
        <p className="mt-1.5 text-[11px] text-charcoal-light/70">
          Loading tasks…
        </p>
      ) : error ? (
        <p className="mt-1.5 text-[11px] text-red-700/90">{error}</p>
      ) : visibleRows.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-charcoal-light/70">
          No Rex tasks yet on this match.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {visibleRows.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawer(t);
                }}
                className="flex w-full items-center gap-2 rounded-md border border-charcoal/10 bg-cream px-2 py-1.5 text-left transition-colors hover:bg-charcoal/[0.03]"
              >
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${STATUS_PILL[t.status]}`}
                >
                  {t.status === "running" ? (
                    <Loader2 className="size-2.5 animate-spin" aria-hidden />
                  ) : null}
                  {STATUS_LABEL[t.status]}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-charcoal">
                  {t.title}
                </span>
                <span className="shrink-0 text-[10px] text-charcoal-light/70">
                  {WORKSPACE_TASK_TYPE_LABELS[t.taskType]}
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-charcoal/15 bg-cream-light/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-charcoal-light">
                  View
                  <ChevronRight className="size-2.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <AskRexPicker
          matchId={matchId}
          onClose={() => setPickerOpen(false)}
          onCreated={(row) => {
            setPickerOpen(false);
            onCreated(row);
          }}
        />
      ) : null}

      {drawer ? (
        <TaskDrawer
          task={drawer}
          onClose={() => setDrawer(null)}
          onRerun={() => void onRerun(drawer.id)}
        />
      ) : null}
    </div>
  );
}

function AskRexPicker({
  matchId,
  onClose,
  onCreated,
}: {
  matchId: string;
  onClose: () => void;
  onCreated: (row: WorkspaceTaskRow) => void;
}) {
  const [taskType, setTaskType] = useState<WorkspaceTaskType>(
    "compile_match_brief",
  );
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptPlaceholder = useMemo(() => {
    switch (taskType) {
      case "compile_match_brief":
        return "Optional: anything to emphasise (e.g. stress fit on geography, flag open questions on team).";
      case "draft_intro_email":
        return "Optional tone or ask (e.g. warm, casual sign-off; ask for a 20-min intro call).";
      case "research_counterparty":
        return "Optional focus (e.g. recent fund raises, portfolio overlap, press mentions).";
      case "summarise_call_notes":
        return "Paste the call transcript or bullet notes Rex should summarise.";
      case "custom":
        return "What do you want Rex to do for this match?";
      default:
        return "";
    }
  }, [taskType]);

  const promptRequired =
    taskType === "custom" || taskType === "summarise_call_notes";

  const onSubmit = async () => {
    const p = prompt.trim();
    if (promptRequired && !p) {
      setError("Add a prompt so Rex has something to work with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType,
          matchId,
          prompt: p || null,
        }),
      });
      const data = (await res.json()) as WorkspaceTaskRow & ApiErr;
      if (!res.ok) {
        const d = data as ApiErr;
        const parts = [d.error, d.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        throw new Error(
          parts.join(" — ") || "Rex couldn't start the task. Try again.",
        );
      }
      onCreated(data as WorkspaceTaskRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceCreateDialog
      open
      title="Ask Rex to…"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="space-y-3 p-4">
        <div>
          <label htmlFor="rex-picker-type" className={WORKSPACE_FORM_LABEL_CLASS}>
            Template
          </label>
          <select
            id="rex-picker-type"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as WorkspaceTaskType)}
            className={WORKSPACE_FORM_INPUT_CLASS}
          >
            {MATCH_PICKER_TYPES.map((t) => (
              <option key={t} value={t}>
                {WORKSPACE_TASK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-charcoal-light/75">
            {WORKSPACE_TASK_TYPE_DESCRIPTIONS[taskType]}
          </p>
        </div>

        <div>
          <label htmlFor="rex-picker-prompt" className={WORKSPACE_FORM_LABEL_CLASS}>
            Prompt {promptRequired ? "" : "(optional)"}
          </label>
          <textarea
            id="rex-picker-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
            placeholder={promptPlaceholder}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-700/90" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={WORKSPACE_FORM_BTN_SECONDARY}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSubmit()}
            className={WORKSPACE_FORM_BTN_PRIMARY}
          >
            {busy ? "Running Rex…" : "Run task"}
          </button>
        </div>
      </div>
    </WorkspaceCreateDialog>
  );
}

