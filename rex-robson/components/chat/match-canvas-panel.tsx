"use client";

import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  MessageSquare,
  Plus,
} from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type MatchKind,
  type MatchOutcome,
  type PipelineInternalComment,
  type PipelineInternalTodo,
  type PipelineTransactionStage,
  type WorkspacePipelineTransactionRow,
} from "@/lib/data/workspace-matches-page.types";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";
import { MatchRexTasks } from "./match-rex-tasks";

type ApiOk = { rows: WorkspacePipelineTransactionRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

const STAGES: {
  id: PipelineTransactionStage;
  label: string;
  description: string;
}[] = [
  {
    id: "active",
    label: "Active",
    description: "Specific deal in motion for this introduction",
  },
  {
    id: "closed",
    label: "Closed",
    description: "Outcome recorded — won, lost, or passed",
  },
];

const KINDS: { id: MatchKind; label: string; short: string }[] = [
  { id: "founder_investor", label: "Founder · Investor", short: "F·I" },
  { id: "founder_lender", label: "Founder · Lender", short: "F·L" },
];

const OUTCOMES: { id: MatchOutcome; label: string }[] = [
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "passed", label: "Passed" },
];

function stageLabel(stage: PipelineTransactionStage | null | undefined) {
  return STAGES.find((s) => s.id === stage)?.label ?? "Active";
}

function kindLabel(kind: MatchKind) {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

function outcomeLabel(outcome: MatchOutcome | null) {
  if (!outcome) return null;
  return OUTCOMES.find((o) => o.id === outcome)?.label ?? outcome;
}

function formatDealWorkspaceTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function PipelineDealInternalSection({
  deal,
  expanded,
  onToggleExpand,
  onAfterPatch,
}: {
  deal: WorkspacePipelineTransactionRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onAfterPatch: () => void;
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const [todoDraft, setTodoDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);

  const runPatch = async (body: Record<string, unknown>) => {
    setLocalError(null);
    setPatchBusy(true);
    try {
      const res = await fetch(`/api/workspace/match-transactions/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLocalError(data.error ?? "Could not save.");
        return;
      }
      onAfterPatch();
    } catch {
      setLocalError("Network error.");
    } finally {
      setPatchBusy(false);
    }
  };

  const nComments = deal.internal_comments.length;
  const nTodos = deal.internal_todos.length;
  const nOpenTodos = deal.internal_todos.filter((t) => !t.done).length;

  return (
    <div className="mt-2 border-t border-charcoal/10 pt-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left text-[11px] font-medium text-charcoal-light transition-colors hover:bg-charcoal/5 hover:text-charcoal"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          )}
          <MessageSquare className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">Team workspace</span>
        </span>
        <span className="shrink-0 text-right text-[10px] text-charcoal-light/80">
          {nComments > 0
            ? `${nComments} comment${nComments === 1 ? "" : "s"}`
            : ""}
          {nComments > 0 && nTodos > 0 ? " · " : ""}
          {nTodos > 0
            ? `${nOpenTodos}/${nTodos} to-do${nTodos === 1 ? "" : "s"}`
            : ""}
          {nComments === 0 && nTodos === 0 ? "Add notes & to-dos" : ""}
        </span>
      </button>
      {expanded ? (
        <div
          className="mt-2 space-y-3 rounded-md border border-charcoal/10 bg-cream/80 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          {localError ? (
            <p className="text-[11px] text-red-700/90" role="alert">
              {localError}
            </p>
          ) : null}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/90">
              Comments
            </p>
            <p className="mb-1.5 text-[10px] text-charcoal-light/75">
              Internal only — not Rex tasks.
            </p>
            <div className="max-h-28 space-y-1.5 overflow-y-auto">
              {[...deal.internal_comments].reverse().map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-charcoal/8 bg-cream px-2 py-1.5 text-[11px] text-charcoal"
                >
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-0.5 text-[10px] text-charcoal-light/70">
                    {formatDealWorkspaceTimestamp(c.created_at)}
                  </p>
                </div>
              ))}
              {deal.internal_comments.length === 0 ? (
                <p className="text-[11px] text-charcoal-light/70">
                  No comments yet.
                </p>
              ) : null}
            </div>
            <div className="mt-1.5 flex gap-1">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                disabled={patchBusy}
                className="min-w-0 flex-1 rounded border border-charcoal/15 bg-cream px-2 py-1 text-[11px] text-charcoal outline-none ring-charcoal/15 focus:ring-1"
              />
              <button
                type="button"
                disabled={patchBusy || commentDraft.trim().length === 0}
                onClick={async () => {
                  const t = commentDraft.trim();
                  if (!t) return;
                  await runPatch({
                    internalComments: [
                      ...deal.internal_comments,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        created_at: new Date().toISOString(),
                      },
                    ],
                  });
                  setCommentDraft("");
                }}
                className="shrink-0 rounded border border-charcoal/20 bg-charcoal px-2 py-1 text-[10px] font-medium text-cream disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/90">
              <ListTodo className="size-3" aria-hidden />
              Internal to-dos
            </p>
            <ul className="max-h-24 space-y-1 overflow-y-auto">
              {deal.internal_todos.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={patchBusy}
                    onChange={async () => {
                      await runPatch({
                        internalTodos: deal.internal_todos.map((x) =>
                          x.id === t.id ? { ...x, done: !x.done } : x,
                        ),
                      });
                    }}
                    className="mt-0.5 rounded border-charcoal/25"
                  />
                  <span
                    className={
                      t.done
                        ? "text-charcoal-light line-through"
                        : "text-charcoal"
                    }
                  >
                    {t.body}
                  </span>
                </li>
              ))}
              {deal.internal_todos.length === 0 ? (
                <li className="text-[11px] text-charcoal-light/70">
                  No to-dos yet.
                </li>
              ) : null}
            </ul>
            <div className="mt-1.5 flex gap-1">
              <input
                type="text"
                value={todoDraft}
                onChange={(e) => setTodoDraft(e.target.value)}
                placeholder="Add a to-do…"
                disabled={patchBusy}
                className="min-w-0 flex-1 rounded border border-charcoal/15 bg-cream px-2 py-1 text-[11px] text-charcoal outline-none ring-charcoal/15 focus:ring-1"
              />
              <button
                type="button"
                disabled={patchBusy || todoDraft.trim().length === 0}
                onClick={async () => {
                  const t = todoDraft.trim();
                  if (!t) return;
                  await runPatch({
                    internalTodos: [
                      ...deal.internal_todos,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        done: false,
                        created_at: new Date().toISOString(),
                      },
                    ],
                  });
                  setTodoDraft("");
                }}
                className="shrink-0 rounded border border-charcoal/20 bg-charcoal px-2 py-1 text-[10px] font-medium text-cream disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const OUTCOME_PILL: Record<MatchOutcome, string> = {
  won: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  lost: "border-red-700/30 bg-red-700/10 text-red-800",
  passed: "border-charcoal/15 bg-charcoal/5 text-charcoal-light",
};

const KIND_BADGE: Record<MatchKind, string> = {
  founder_investor: "border-charcoal/15 bg-charcoal/5 text-charcoal",
  founder_lender: "border-charcoal/20 bg-charcoal/10 text-charcoal",
};

type OpportunityPick = {
  id: string;
  contact_a_name: string;
  contact_b_name: string;
};

const MATCH_CANVAS_PAGE_SIZE = 500;

export function MatchCanvasPanel() {
  const pageSize = MATCH_CANVAS_PAGE_SIZE;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rows, setRows] = useState<WorkspacePipelineTransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [stageMoveBusyId, setStageMoveBusyId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PipelineTransactionStage | null>(
    null,
  );
  const [dropPulseStage, setDropPulseStage] =
    useState<PipelineTransactionStage | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [opportunityOptions, setOpportunityOptions] = useState<
    OpportunityPick[]
  >([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);

  const [fMatchId, setFMatchId] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fKind, setFKind] = useState<MatchKind>("founder_investor");
  const [fStage, setFStage] = useState<PipelineTransactionStage>("active");
  const [fOutcome, setFOutcome] = useState<MatchOutcome | "">("");
  const [fContext, setFContext] = useState("");
  const [fNotes, setFNotes] = useState("");
  /** Display-only in edit mode */
  const [fPairHeadline, setFPairHeadline] = useState("");
  const [fInternalComments, setFInternalComments] = useState<
    PipelineInternalComment[]
  >([]);
  const [fInternalTodos, setFInternalTodos] = useState<PipelineInternalTodo[]>(
    [],
  );
  const [fTeamCommentDraft, setFTeamCommentDraft] = useState("");
  const [fTeamTodoDraft, setFTeamTodoDraft] = useState("");
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: "1",
      pageSize: String(pageSize),
    });
    if (debouncedQuery !== "") params.set("q", debouncedQuery);
    try {
      const res = await fetch(
        `/api/workspace/match-transactions?${params.toString()}`,
      );
      const data = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load deals.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading deals.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, pageSize]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  const ensureOpportunitiesLoaded = useCallback(async () => {
    if (opportunityOptions.length > 0 || opportunitiesLoading) return;
    setOpportunitiesLoading(true);
    try {
      const res = await fetch("/api/workspace/opportunities");
      const data = (await res.json()) as {
        rows?: OpportunityPick[];
        error?: string;
      };
      if (res.ok && Array.isArray(data.rows)) {
        setOpportunityOptions(data.rows);
      }
    } catch {
      // picker stays empty; user can open Opportunities first
    } finally {
      setOpportunitiesLoading(false);
    }
  }, [opportunityOptions.length, opportunitiesLoading]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setDetailLoading(false);
    setFMatchId("");
    setFTitle("");
    setFKind("founder_investor");
    setFStage("active");
    setFOutcome("");
    setFContext("");
    setFNotes("");
    setFPairHeadline("");
    setFInternalComments([]);
    setFInternalTodos([]);
    setFTeamCommentDraft("");
    setFTeamTodoDraft("");
    setFormError(null);
    setFormOpen(true);
    void ensureOpportunitiesLoaded();
  };

  const openEdit = useCallback(
    async (m: WorkspacePipelineTransactionRow) => {
      setFormMode("edit");
      setEditingId(m.id);
      setFormError(null);
      setFormOpen(true);
      setDetailLoading(true);
      setFTeamCommentDraft("");
      setFTeamTodoDraft("");
      setFPairHeadline(`${m.contact_a_name} ↔ ${m.contact_b_name}`);
      setFKind(m.kind);
      setFStage(m.stage);
      setFOutcome(m.outcome ?? "");
      setFContext(m.context ?? "");
      setFNotes(m.notes ?? "");
      setFTitle(m.title ?? "");
      setFInternalComments(m.internal_comments ?? []);
      setFInternalTodos(m.internal_todos ?? []);
      try {
        const res = await fetch(`/api/workspace/match-transactions/${m.id}`);
        const data = (await res.json()) as WorkspacePipelineTransactionRow & {
          error?: string;
        };
        if (!res.ok) {
          setFormError(
            typeof data.error === "string" && data.error.length > 0
              ? data.error
              : "Could not load deal.",
          );
          return;
        }
        setFPairHeadline(`${data.contact_a_name} ↔ ${data.contact_b_name}`);
        setFKind(data.kind);
        setFStage(data.stage);
        setFOutcome(data.outcome ?? "");
        setFContext(data.context ?? "");
        setFNotes(data.notes ?? "");
        setFTitle(data.title ?? "");
        setFInternalComments(data.internal_comments ?? []);
        setFInternalTodos(data.internal_todos ?? []);
      } catch {
        setFormError("Network error while loading deal.");
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
    setEditingId(null);
    setDetailLoading(false);
  };

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (detailLoading) return;
    if (formMode === "create") {
      if (!fMatchId) {
        setFormError("Pick an introduction from Opportunities.");
        return;
      }
    }
    if (fStage === "closed" && !fOutcome) {
      setFormError("Pick an outcome to close this deal.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      if (formMode === "create" && editingId == null) {
        const res = await fetch("/api/workspace/match-transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: fMatchId,
            title: fTitle.trim() === "" ? null : fTitle.trim(),
            context: fContext.trim() === "" ? null : fContext.trim(),
            notes: fNotes.trim() === "" ? null : fNotes.trim(),
          }),
        });
        const data = (await res.json()) as { error?: string; hint?: string };
        if (!res.ok) {
          const parts = [data.error, data.hint].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
          setFormError(parts.length > 0 ? parts.join(" ") : "Could not save.");
          return;
        }
      } else if (formMode === "edit" && editingId != null) {
        const res = await fetch(`/api/workspace/match-transactions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fTitle.trim() === "" ? null : fTitle.trim(),
            stage: fStage,
            outcome: fStage === "closed" ? fOutcome || null : null,
            context: fContext.trim() === "" ? null : fContext.trim(),
            notes: fNotes.trim() === "" ? null : fNotes.trim(),
            internalComments: fInternalComments,
            internalTodos: fInternalTodos,
          }),
        });
        const data = (await res.json()) as { error?: string; hint?: string };
        if (!res.ok) {
          const parts = [data.error, data.hint].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
          setFormError(parts.length > 0 ? parts.join(" ") : "Could not save.");
          return;
        }
      }
      setFormOpen(false);
      setEditingId(null);
      setReloadTick((n) => n + 1);
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setFormBusy(false);
    }
  };

  const moveStage = useCallback(
    async (
      transactionId: string,
      toStage: PipelineTransactionStage,
      outcome: MatchOutcome | null = null,
    ) => {
      const source = rows.find((r) => r.id === transactionId);
      if (!source) return;
      if (source.stage === toStage && source.outcome === outcome) return;
      if (toStage === "closed" && !outcome) {
        void openEdit({ ...source, stage: "closed" });
        return;
      }

      const previousRows = rows;
      setRows((prev) =>
        prev.map((row) =>
          row.id === transactionId
            ? {
                ...row,
                stage: toStage,
                outcome: toStage === "closed" ? outcome : null,
              }
            : row,
        ),
      );
      setStageMoveBusyId(transactionId);
      setError(null);
      try {
        const res = await fetch(
          `/api/workspace/match-transactions/${transactionId}/stage`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: toStage, outcome }),
          },
        );
        const data = (await res.json()) as ApiErr;
        if (!res.ok) {
          setRows(previousRows);
          setError(data.error ?? "Could not move deal stage.");
          return;
        }
      } catch {
        setRows(previousRows);
        setError("Network error while moving deal stage.");
      } finally {
        setStageMoveBusyId(null);
      }
    },
    [openEdit, rows],
  );

  const onCardDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    const dragPreview = e.currentTarget.cloneNode(true) as HTMLDivElement;
    dragPreview.style.position = "absolute";
    dragPreview.style.left = "-9999px";
    dragPreview.style.top = "-9999px";
    dragPreview.style.width = `${e.currentTarget.getBoundingClientRect().width}px`;
    dragPreview.style.opacity = "1";
    dragPreview.style.background = "#f8f6ef";
    dragPreview.style.border = "1px solid rgba(31,31,31,0.25)";
    dragPreview.style.boxShadow = "0 12px 26px rgba(0,0,0,0.16)";
    dragPreview.style.transform = "rotate(1deg)";
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 20, 20);
    window.setTimeout(() => dragPreview.remove(), 0);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  };

  const onCardDragEnd = () => {
    setDraggingId(null);
    setDropStage(null);
  };

  const onColumnDragOver = (
    e: DragEvent<HTMLElement>,
    stage: PipelineTransactionStage,
  ) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStage(stage);
  };

  const onColumnDragLeave = (
    e: DragEvent<HTMLElement>,
    stage: PipelineTransactionStage,
  ) => {
    if (dropStage !== stage) return;
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setDropStage(null);
  };

  const onColumnDrop = async (
    e: DragEvent<HTMLElement>,
    stage: PipelineTransactionStage,
  ) => {
    e.preventDefault();
    const txId = e.dataTransfer.getData("text/plain") || draggingId;
    setDropStage(null);
    if (!txId || stageMoveBusyId) return;
    const source = rows.find((r) => r.id === txId);
    if (!source || source.stage === stage) return;
    setDropPulseStage(stage);
    window.setTimeout(
      () => setDropPulseStage((s) => (s === stage ? null : s)),
      180,
    );
    await moveStage(txId, stage);
  };

  const stageColumns = useMemo(() => {
    return STAGES.map((s) => ({
      ...s,
      rows: rows.filter((r) => r.stage === s.id),
    }));
  }, [rows]);

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Pipeline
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No deals for that search."
                    : "No deals yet — add one from Opportunities after you record an introduction."
                  : `${total} deal${total === 1 ? "" : "s"} on the board`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            New deal
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search deals</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search: contacts, title, context, notes, team workspace…"
            autoComplete="off"
            className="w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-light/50 outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 shrink-0 text-sm text-red-700/90" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-charcoal/8 bg-cream-light/40 p-3">
        <div className="grid min-w-[560px] grid-cols-2 gap-3">
          {stageColumns.map((column) => (
            <section
              key={column.id}
              onDragOver={(e) => onColumnDragOver(e, column.id)}
              onDragLeave={(e) => onColumnDragLeave(e, column.id)}
              onDrop={(e) => void onColumnDrop(e, column.id)}
              className={`rounded-lg border bg-cream p-2 transition-all duration-150 ${
                dropStage === column.id
                  ? "scale-[1.015] border-charcoal/30 bg-charcoal/[0.05] shadow-md"
                  : dropPulseStage === column.id
                    ? "scale-[1.01] border-charcoal/25 bg-charcoal/[0.04] shadow-sm"
                    : "border-charcoal/8"
              }`}
            >
              <div className="mb-2 flex items-center justify-between border-b border-charcoal/8 px-1 pb-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/80">
                    {column.label}
                  </p>
                  <p className="text-[11px] text-charcoal-light/70">
                    {column.description}
                  </p>
                </div>
                <span className="text-xs text-charcoal-light/80">
                  {column.rows.length}
                </span>
              </div>
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-md border border-charcoal/10 p-3"
                    >
                      <div className="h-4 w-40 rounded bg-charcoal/10" />
                      <div className="mt-2 h-3 w-24 rounded bg-charcoal/5" />
                    </div>
                  ))
                ) : column.rows.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-charcoal-light/70">
                    No deals in this stage.
                  </p>
                ) : (
                  column.rows.map((m) => (
                    <div
                      key={m.id}
                      draggable={stageMoveBusyId !== m.id}
                      onDragStart={(e) => onCardDragStart(e, m.id)}
                      onDragEnd={onCardDragEnd}
                      className={`rounded-md border bg-cream-light/30 p-3 transition-[transform,box-shadow,opacity] duration-150 will-change-transform ${
                        draggingId === m.id
                          ? "z-10 scale-[1.02] border-charcoal/30 opacity-100 shadow-lg"
                          : "border-charcoal/10 shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] hover:shadow-md"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void openEdit(m)}
                        className="w-full cursor-grab text-left active:cursor-grabbing"
                        aria-label={`Edit deal between ${m.contact_a_name} and ${m.contact_b_name}`}
                      >
                        <p className="text-sm font-medium text-charcoal">
                          {m.contact_a_name}{" "}
                          <span className="text-charcoal-light/70">↔</span>{" "}
                          {m.contact_b_name}
                        </p>
                        {m.title ? (
                          <p className="mt-0.5 text-xs font-medium text-charcoal-light">
                            {m.title}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_BADGE[m.kind]}`}
                          >
                            {kindLabel(m.kind)}
                          </span>
                          {m.stage === "closed" && m.outcome ? (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${OUTCOME_PILL[m.outcome]}`}
                            >
                              {outcomeLabel(m.outcome)}
                            </span>
                          ) : null}
                        </div>
                        {m.context ? (
                          <p className="mt-2 line-clamp-3 text-xs text-charcoal-light/85">
                            {m.context}
                          </p>
                        ) : null}
                      </button>
                      <MatchRexTasks matchId={m.match_id} />
                      <PipelineDealInternalSection
                        deal={m}
                        expanded={internalExpandedId === m.id}
                        onToggleExpand={() =>
                          setInternalExpandedId((cur) =>
                            cur === m.id ? null : m.id,
                          )
                        }
                        onAfterPatch={() => setReloadTick((n) => n + 1)}
                      />
                      <div className="mt-2 flex items-center gap-1.5">
                        {STAGES.filter((x) => x.id !== m.stage).map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            disabled={stageMoveBusyId === m.id}
                            onClick={() => void moveStage(m.id, target.id)}
                            className="rounded border border-charcoal/15 px-1.5 py-1 text-[11px] text-charcoal-light transition-colors hover:bg-charcoal/5 disabled:opacity-50"
                          >
                            {target.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <WorkspaceCreateDialog
        open={formOpen}
        title={formMode === "create" ? "New pipeline deal" : "Edit deal"}
        onClose={closeForm}
      >
        <form
          onSubmit={onSubmitForm}
          className="space-y-3 p-4"
          key={`${formMode}-${editingId ?? "new"}`}
        >
          {detailLoading ? (
            <p className="py-6 text-center text-sm text-charcoal-light">
              Loading…
            </p>
          ) : (
            <>
              {formMode === "create" ? (
                <div>
                  <label
                    htmlFor="deal-form-opportunity"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Introduction
                  </label>
                  <select
                    id="deal-form-opportunity"
                    required
                    value={fMatchId}
                    onChange={(e) => setFMatchId(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                  >
                    <option value="">— pick an opportunity —</option>
                    {opportunityOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.contact_a_name} ↔ {o.contact_b_name}
                      </option>
                    ))}
                  </select>
                  {opportunitiesLoading ? (
                    <p className="mt-1 text-[11px] text-charcoal-light/70">
                      Loading opportunities…
                    </p>
                  ) : opportunityOptions.length === 0 ? (
                    <p className="mt-1 text-[11px] text-charcoal-light/80">
                      Record an introduction under{" "}
                      <span className="font-medium text-charcoal">
                        Opportunities
                      </span>{" "}
                      first.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-charcoal/10 bg-cream-light/40 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
                    Pair
                  </p>
                  <p className="text-sm font-medium text-charcoal">
                    {fPairHeadline}
                  </p>
                  <span
                    className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_BADGE[fKind]}`}
                  >
                    {kindLabel(fKind)}
                  </span>
                </div>
              )}
              <div>
                <label
                  htmlFor="deal-form-title"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Deal label (optional)
                </label>
                <input
                  id="deal-form-title"
                  type="text"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="e.g. Series A, venture debt"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="deal-form-stage"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Stage
                  </label>
                  <select
                    id="deal-form-stage"
                    value={fStage}
                    onChange={(e) => {
                      const next = e.target.value as PipelineTransactionStage;
                      setFStage(next);
                      if (next !== "closed") setFOutcome("");
                    }}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="deal-form-outcome"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Outcome {fStage === "closed" ? "*" : "(closed only)"}
                  </label>
                  <select
                    id="deal-form-outcome"
                    value={fOutcome}
                    disabled={fStage !== "closed"}
                    onChange={(e) =>
                      setFOutcome(e.target.value as MatchOutcome | "")
                    }
                    className={WORKSPACE_FORM_INPUT_CLASS}
                  >
                    <option value="">— pick outcome —</option>
                    {OUTCOMES.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label
                  htmlFor="deal-form-context"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Context
                </label>
                <textarea
                  id="deal-form-context"
                  value={fContext}
                  onChange={(e) => setFContext(e.target.value)}
                  rows={3}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="What is this specific transaction about?"
                />
              </div>
              <div>
                <label
                  htmlFor="deal-form-notes"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Notes
                </label>
                <textarea
                  id="deal-form-notes"
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  rows={2}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="Internal-only notes."
                />
              </div>
              {formMode === "edit" ? (
                <div className="rounded-lg border border-charcoal/10 bg-cream-light/50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/90">
                    Team workspace
                  </p>
                  <p className="mt-0.5 text-[11px] text-charcoal-light/75">
                    Comments and to-dos stay internal — they are not Rex tasks.
                  </p>
                  <div className="mt-3">
                    <p className={WORKSPACE_FORM_LABEL_CLASS}>Comments</p>
                    <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-charcoal/10 bg-cream p-2">
                      {[...fInternalComments].reverse().map((c) => (
                        <div
                          key={c.id}
                          className="rounded border border-charcoal/8 bg-cream-light/40 px-2 py-1.5 text-xs text-charcoal"
                        >
                          <p className="whitespace-pre-wrap">{c.body}</p>
                          <p className="mt-0.5 text-[10px] text-charcoal-light/70">
                            {formatDealWorkspaceTimestamp(c.created_at)}
                          </p>
                        </div>
                      ))}
                      {fInternalComments.length === 0 ? (
                        <p className="text-xs text-charcoal-light/70">
                          No comments yet.
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={fTeamCommentDraft}
                        onChange={(e) => setFTeamCommentDraft(e.target.value)}
                        placeholder="Add a comment…"
                        className={WORKSPACE_FORM_INPUT_CLASS}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const t = fTeamCommentDraft.trim();
                          if (!t) return;
                          setFInternalComments((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              body: t,
                              created_at: new Date().toISOString(),
                            },
                          ]);
                          setFTeamCommentDraft("");
                        }}
                      />
                      <button
                        type="button"
                        className={WORKSPACE_FORM_BTN_SECONDARY}
                        onClick={() => {
                          const t = fTeamCommentDraft.trim();
                          if (!t) return;
                          setFInternalComments((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              body: t,
                              created_at: new Date().toISOString(),
                            },
                          ]);
                          setFTeamCommentDraft("");
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className={WORKSPACE_FORM_LABEL_CLASS}>
                      Internal to-dos
                    </p>
                    <ul className="max-h-28 space-y-1.5 overflow-y-auto rounded-md border border-charcoal/10 bg-cream p-2">
                      {fInternalTodos.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-start gap-2 text-xs text-charcoal"
                        >
                          <input
                            type="checkbox"
                            checked={t.done}
                            onChange={() =>
                              setFInternalTodos((prev) =>
                                prev.map((x) =>
                                  x.id === t.id ? { ...x, done: !x.done } : x,
                                ),
                              )
                            }
                            className="mt-0.5 rounded border-charcoal/25"
                          />
                          <span
                            className={
                              t.done
                                ? "text-charcoal-light line-through"
                                : undefined
                            }
                          >
                            {t.body}
                          </span>
                        </li>
                      ))}
                      {fInternalTodos.length === 0 ? (
                        <li className="text-xs text-charcoal-light/70">
                          No to-dos yet.
                        </li>
                      ) : null}
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={fTeamTodoDraft}
                        onChange={(e) => setFTeamTodoDraft(e.target.value)}
                        placeholder="Add a to-do…"
                        className={WORKSPACE_FORM_INPUT_CLASS}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const t = fTeamTodoDraft.trim();
                          if (!t) return;
                          setFInternalTodos((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              body: t,
                              done: false,
                              created_at: new Date().toISOString(),
                            },
                          ]);
                          setFTeamTodoDraft("");
                        }}
                      />
                      <button
                        type="button"
                        className={WORKSPACE_FORM_BTN_SECONDARY}
                        onClick={() => {
                          const t = fTeamTodoDraft.trim();
                          if (!t) return;
                          setFInternalTodos((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              body: t,
                              done: false,
                              created_at: new Date().toISOString(),
                            },
                          ]);
                          setFTeamTodoDraft("");
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
          {formError ? (
            <p className="text-sm text-red-700/90" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              disabled={formBusy}
              className={WORKSPACE_FORM_BTN_SECONDARY}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formBusy || detailLoading}
              className={WORKSPACE_FORM_BTN_PRIMARY}
            >
              {formBusy
                ? "Saving…"
                : formMode === "create"
                  ? "Add deal"
                  : "Save changes"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>
    </div>
  );
}
