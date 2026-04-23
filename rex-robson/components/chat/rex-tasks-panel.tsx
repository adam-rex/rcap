"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
} from "./workspace-create-dialog";

type TaskStatus = "pending" | "running" | "done" | "dismissed";
type TaskSource = "manual" | "meeting_note" | "email" | "import";

type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  status: TaskStatus;
  source: TaskSource;
  dueAt: string | null;
  createdAt: string;
};

type ApiListOk = { rows: TaskRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

const NOTE_SOURCES = ["Otter.ai", "Zoom notes", "Fireflies", "Granola", "Gemini"] as const;

function sourceLabel(source: TaskSource): string {
  switch (source) {
    case "meeting_note":
      return "meeting note";
    case "email":
      return "email";
    case "import":
      return "import";
    default:
      return "manual";
  }
}

export function RexTasksPanel() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending" || r.status === "running"),
    [rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/tasks?page=1&pageSize=50");
      const data = (await res.json()) as ApiListOk & ApiErr;
      if (!res.ok) {
        throw new Error(data.error ?? "Could not load tasks.");
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setSubmitError("Title is required.");
      return;
    }
    setCreating(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          detail: detail.trim() || null,
          source: "manual",
        }),
      });
      const data = (await res.json()) as ApiErr;
      if (!res.ok) {
        throw new Error(data.error ?? "Could not create task.");
      }
      setTitle("");
      setDetail("");
      setOpenCreate(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-charcoal/10 bg-cream-light p-5 shadow-sm sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-charcoal/10 pb-4">
          <div>
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Tasks
            </h2>
            <p className="mt-1.5 text-sm text-charcoal-light">
              Rex-owned task queue. Meeting-note suggestions stay in Suggestions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpenCreate((v) => !v);
              setSubmitError(null);
            }}
            className={WORKSPACE_FORM_BTN_PRIMARY + " inline-flex items-center gap-1.5"}
          >
            <Plus className="size-4" />
            Create task
          </button>
        </header>

        {openCreate ? (
          <form
            onSubmit={onCreate}
            className="mt-4 rounded-xl border border-charcoal/10 bg-[#f0efe8] p-4"
          >
            <label htmlFor="rex-task-title" className={WORKSPACE_FORM_LABEL_CLASS}>
              Title
            </label>
            <input
              id="rex-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Review Shawbrook follow-up dependencies"
            />
            <label htmlFor="rex-task-detail" className={WORKSPACE_FORM_LABEL_CLASS + " mt-3"}>
              Detail
            </label>
            <textarea
              id="rex-task-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Optional context for Rex..."
            />
            {submitError ? (
              <p className="mt-2 text-xs text-red-700/90">{submitError}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={creating} className={WORKSPACE_FORM_BTN_PRIMARY}>
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                className={WORKSPACE_FORM_BTN_SECONDARY}
                onClick={() => setOpenCreate(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <section className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-light/80">
            Call-note sources Rex can parse
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {NOTE_SOURCES.map((src) => (
              <span
                key={src}
                className="rounded-md border border-charcoal/15 bg-cream px-2.5 py-1 text-xs text-charcoal-light"
              >
                {src}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-charcoal/10 bg-[#f0efe8] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-light/80">
            Rex task queue ({pending.length} open)
          </p>
          {loading ? (
            <p className="mt-2 text-sm text-charcoal-light">Loading tasks…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-700/90">{error}</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-light">
              No Rex tasks queued yet. As meeting notes are imported, Rex can run
              agent-side tasks while people/match/follow-up items are kept in Suggestions.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-charcoal/10 bg-cream-light px-3 py-2.5"
                >
                  <p className="text-sm font-medium text-charcoal">{row.title}</p>
                  {row.detail ? (
                    <p className="mt-0.5 text-xs text-charcoal-light">{row.detail}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-charcoal-light/80">
                    {row.status} · {sourceLabel(row.source)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
