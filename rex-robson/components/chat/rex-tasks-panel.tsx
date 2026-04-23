"use client";

import { Sparkles } from "lucide-react";
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
  WORKSPACE_TASK_TYPE_REQUIRES_MATCH,
  type WorkspaceTaskRow,
  type WorkspaceTaskStatus,
  type WorkspaceTaskType,
} from "@/lib/data/workspace-tasks.types";

type ApiListOk = { rows: WorkspaceTaskRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

type MatchOption = {
  id: string;
  contact_a_name: string;
  contact_b_name: string;
};

type MatchFilter =
  | { kind: "all" }
  | { kind: "unattached" }
  | { kind: "match"; matchId: string };

type TaskView = "requested" | "completed";

const VIEW_SECTIONS: Record<TaskView, Array<WorkspaceTaskStatus>> = {
  requested: ["running", "pending", "failed"],
  completed: ["done", "dismissed"],
};

/**
 * Sections in display order. "Queued" = pending, "Archive" keeps Dismissed out
 * of the main flow but still one click away.
 */
const SECTIONS: Array<{
  key: "running" | "pending" | "done" | "failed" | "dismissed";
  label: string;
  empty: string;
}> = [
  { key: "running", label: "Running", empty: "Nothing running." },
  { key: "pending", label: "Queued", empty: "No queued tasks." },
  { key: "done", label: "Done", empty: "No completed tasks yet." },
  {
    key: "failed",
    label: "Failed",
    empty: "No failed tasks. Nice.",
  },
  { key: "dismissed", label: "Dismissed", empty: "No dismissed tasks." },
];

const PICKER_TASK_TYPES: WorkspaceTaskType[] = [
  "compile_match_brief",
  "draft_intro_email",
  "research_counterparty",
  "summarise_call_notes",
  "custom",
];

export function RexTasksPanel() {
  const [rows, setRows] = useState<WorkspaceTaskRow[]>([]);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [filter, setFilter] = useState<MatchFilter>({ kind: "all" });
  const [view, setView] = useState<TaskView>("requested");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawer, setDrawer] = useState<WorkspaceTaskRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/tasks?page=1&pageSize=100");
      const data = (await res.json()) as ApiListOk & ApiErr;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        throw new Error(parts.join(" — ") || "Could not load tasks.");
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One-shot lookup of matches for the filter + picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/workspace/matches?page=1&pageSize=100",
        );
        const data = (await res.json()) as {
          rows?: Array<{
            id: string;
            contact_a_name: string;
            contact_b_name: string;
          }>;
        };
        if (!cancelled && Array.isArray(data.rows)) {
          setMatches(
            data.rows.map((m) => ({
              id: m.id,
              contact_a_name: m.contact_a_name,
              contact_b_name: m.contact_b_name,
            })),
          );
        }
      } catch {
        // Network error; filter will just not have match options. The cross-
        // match queue still works via All / Unattached.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter.kind === "all") return rows;
    if (filter.kind === "unattached")
      return rows.filter((r) => r.matchId == null);
    return rows.filter((r) => r.matchId === filter.matchId);
  }, [rows, filter]);

  const bySection = useMemo(() => {
    const buckets: Record<WorkspaceTaskStatus, WorkspaceTaskRow[]> = {
      pending: [],
      running: [],
      done: [],
      dismissed: [],
      failed: [],
    };
    for (const r of filtered) buckets[r.status].push(r);
    return buckets;
  }, [filtered]);

  const replaceRow = useCallback((row: WorkspaceTaskRow) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx === -1) return [row, ...prev];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
    setDrawer((d) => (d && d.id === row.id ? row : d));
  }, []);

  const onRun = useCallback(
    async (task: WorkspaceTaskRow) => {
      replaceRow({ ...task, status: "running", error: null });
      try {
        const res = await fetch(
          `/api/workspace/tasks/${encodeURIComponent(task.id)}/run`,
          { method: "POST" },
        );
        const data = await res.json();
        const row: WorkspaceTaskRow | null =
          res.ok && data && typeof data === "object"
            ? (data as WorkspaceTaskRow)
            : (data?.row as WorkspaceTaskRow) ?? null;
        if (row) replaceRow(row);
      } catch {
        // Leave running; a reload will reconcile.
      } finally {
        void load();
      }
    },
    [load, replaceRow],
  );

  const onDismiss = useCallback(
    async (task: WorkspaceTaskRow) => {
      try {
        const res = await fetch(
          `/api/workspace/tasks/${encodeURIComponent(task.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "dismiss" }),
          },
        );
        const data = (await res.json()) as WorkspaceTaskRow & ApiErr;
        if (res.ok) replaceRow(data as WorkspaceTaskRow);
      } catch {
        // Ignore; reload will reconcile.
      } finally {
        void load();
      }
    },
    [load, replaceRow],
  );

  const activeCount = bySection.pending.length + bySection.running.length;
  const requestedCount =
    bySection.running.length +
    bySection.pending.length +
    bySection.failed.length;
  const completedCount = bySection.done.length + bySection.dismissed.length;
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => VIEW_SECTIONS[view].includes(s.key)),
    [view],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-charcoal/10 bg-cream-light p-5 shadow-sm sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-charcoal/10 pb-4">
          <div>
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Rex&apos;s to-do list
            </h2>
            <p className="mt-1.5 text-sm text-charcoal-light">
              Agent-executed work across every match. Suggestions is for
              &ldquo;should we do this?&rdquo;; this queue is &ldquo;Rex, go do
              it.&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={
              WORKSPACE_FORM_BTN_PRIMARY + " inline-flex items-center gap-1.5"
            }
          >
            <Sparkles className="size-4" aria-hidden />
            Ask Rex to…
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Task view"
          className="mt-4 inline-flex rounded-full border border-charcoal/15 bg-cream p-0.5"
        >
          <ViewTab
            active={view === "requested"}
            onClick={() => setView("requested")}
          >
            Requested ({requestedCount})
          </ViewTab>
          <ViewTab
            active={view === "completed"}
            onClick={() => setView("completed")}
          >
            Completed ({completedCount})
          </ViewTab>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterChip
            active={filter.kind === "all"}
            onClick={() => setFilter({ kind: "all" })}
          >
            All ({rows.length})
          </FilterChip>
          <FilterChip
            active={filter.kind === "unattached"}
            onClick={() => setFilter({ kind: "unattached" })}
          >
            Unattached ({rows.filter((r) => !r.matchId).length})
          </FilterChip>
          {matches.length > 0 ? (
            <label className="ml-auto flex items-center gap-2 text-[11px] text-charcoal-light">
              By match
              <select
                value={filter.kind === "match" ? filter.matchId : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setFilter({ kind: "all" });
                  else setFilter({ kind: "match", matchId: v });
                }}
                className={WORKSPACE_FORM_INPUT_CLASS + " !w-64 !py-1"}
              >
                <option value="">— any —</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.contact_a_name} ↔ {m.contact_b_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-charcoal-light">Loading tasks…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-red-700/90">{error}</p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-light/80">
              {view === "requested"
                ? activeCount === 0
                  ? "All caught up."
                  : `${activeCount} active task${activeCount === 1 ? "" : "s"}`
                : completedCount === 0
                  ? "Nothing finished yet."
                  : `${completedCount} task${completedCount === 1 ? "" : "s"} completed`}
            </p>
            {visibleSections.map((section) => {
              const items = bySection[section.key];
              if (section.key === "dismissed" && items.length === 0) return null;
              return (
                <TaskSection
                  key={section.key}
                  label={section.label}
                  empty={section.empty}
                  rows={items}
                  onOpen={setDrawer}
                />
              );
            })}
          </div>
        )}
      </div>

      {pickerOpen ? (
        <AskRexGlobalPicker
          matches={matches}
          onClose={() => setPickerOpen(false)}
          onCreated={(row) => {
            setPickerOpen(false);
            replaceRow(row);
            if (row.status === "done" || row.status === "failed") {
              setDrawer(row);
            }
            void load();
          }}
        />
      ) : null}

      {drawer ? (
        <TaskDrawer
          task={drawer}
          onClose={() => setDrawer(null)}
          onRerun={() => void onRun(drawer)}
          onDismiss={() => void onDismiss(drawer)}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors " +
        (active
          ? "border-charcoal bg-charcoal text-cream"
          : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-charcoal/5")
      }
    >
      {children}
    </button>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-charcoal text-cream shadow-sm"
          : "text-charcoal-light hover:bg-charcoal/5")
      }
    >
      {children}
    </button>
  );
}

function TaskSection({
  label,
  empty,
  rows,
  onOpen,
}: {
  label: string;
  empty: string;
  rows: WorkspaceTaskRow[];
  onOpen: (row: WorkspaceTaskRow) => void;
}) {
  return (
    <section className="rounded-xl border border-charcoal/10 bg-[#f0efe8] p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-light/80">
          {label} · {rows.length}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-charcoal-light/80">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpen(task)}
                className="flex w-full items-start gap-2 rounded-lg border border-charcoal/10 bg-cream-light px-3 py-2 text-left transition-colors hover:bg-cream"
              >
                <span
                  className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${STATUS_PILL[task.status]}`}
                >
                  {STATUS_LABEL[task.status]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-charcoal">
                    {task.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-charcoal-light/80">
                    {WORKSPACE_TASK_TYPE_LABELS[task.taskType]}
                    {task.match
                      ? ` · ${task.match.contactAName} ↔ ${task.match.contactBName}`
                      : task.contact
                        ? ` · ${task.contact.name}`
                        : " · unattached"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AskRexGlobalPicker({
  matches,
  onClose,
  onCreated,
}: {
  matches: MatchOption[];
  onClose: () => void;
  onCreated: (row: WorkspaceTaskRow) => void;
}) {
  const [taskType, setTaskType] = useState<WorkspaceTaskType>("custom");
  const [matchId, setMatchId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchRequired = WORKSPACE_TASK_TYPE_REQUIRES_MATCH[taskType];
  const promptRequired = taskType === "custom" || taskType === "summarise_call_notes";

  const submit = async () => {
    if (matchRequired && !matchId) {
      setError("Pick a match for this template.");
      return;
    }
    if (promptRequired && !prompt.trim()) {
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
          matchId: matchId || null,
          prompt: prompt.trim() || null,
        }),
      });
      const data = (await res.json()) as WorkspaceTaskRow & ApiErr;
      if (!res.ok) {
        const d = data as ApiErr;
        const parts = [d.error, d.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        throw new Error(
          parts.join(" — ") || "Rex couldn't start that task.",
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
          <label htmlFor="rex-global-type" className={WORKSPACE_FORM_LABEL_CLASS}>
            Template
          </label>
          <select
            id="rex-global-type"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as WorkspaceTaskType)}
            className={WORKSPACE_FORM_INPUT_CLASS}
          >
            {PICKER_TASK_TYPES.map((t) => (
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
          <label htmlFor="rex-global-match" className={WORKSPACE_FORM_LABEL_CLASS}>
            Match {matchRequired ? "*" : "(optional)"}
          </label>
          <select
            id="rex-global-match"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className={WORKSPACE_FORM_INPUT_CLASS}
          >
            <option value="">— no match —</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.contact_a_name} ↔ {m.contact_b_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="rex-global-prompt"
            className={WORKSPACE_FORM_LABEL_CLASS}
          >
            Prompt {promptRequired ? "*" : "(optional)"}
          </label>
          <textarea
            id="rex-global-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
            placeholder={
              taskType === "summarise_call_notes"
                ? "Paste the transcript or your bullet notes from the call."
                : "Optional extra context for Rex."
            }
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
            onClick={onClose}
            disabled={busy}
            className={WORKSPACE_FORM_BTN_SECONDARY}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={WORKSPACE_FORM_BTN_PRIMARY}
          >
            {busy ? "Running Rex…" : "Run task"}
          </button>
        </div>
      </div>
    </WorkspaceCreateDialog>
  );
}
