"use client";

import { Plus } from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type MatchKind,
  type MatchOutcome,
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

function kindLabel(kind: MatchKind) {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

function outcomeLabel(outcome: MatchOutcome | null) {
  if (!outcome) return null;
  return OUTCOMES.find((o) => o.id === outcome)?.label ?? outcome;
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
  const router = useRouter();
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
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [opportunityOptions, setOpportunityOptions] = useState<
    OpportunityPick[]
  >([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);

  const [fMatchId, setFMatchId] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fContext, setFContext] = useState("");
  const [fNotes, setFNotes] = useState("");

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
    setFMatchId("");
    setFTitle("");
    setFContext("");
    setFNotes("");
    setFormError(null);
    setFormOpen(true);
    void ensureOpportunitiesLoaded();
  };

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
  };

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!fMatchId) {
      setFormError("Pick an introduction from Opportunities.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
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
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setFormError(parts.length > 0 ? parts.join(" ") : "Could not save.");
        return;
      }
      const createdId = data.id;
      setFormOpen(false);
      setReloadTick((n) => n + 1);
      if (typeof createdId === "string" && createdId.length > 0) {
        router.push(`/pipeline/deals/${createdId}`);
      }
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
        router.push(`/pipeline/deals/${transactionId}`);
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
    [router, rows],
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
    <div className="flex w-full min-w-0 flex-col px-4 py-6 sm:px-8">
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

      <div className="mt-4 rounded-xl border border-charcoal/8 bg-cream-light/40 p-3 sm:overflow-x-auto">
        <div className="grid grid-cols-1 gap-3 sm:min-w-[560px] sm:grid-cols-2">
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
                        onClick={() => router.push(`/pipeline/deals/${m.id}`)}
                        className="w-full cursor-grab text-left active:cursor-grabbing"
                        aria-label={`Open deal between ${m.contact_a_name} and ${m.contact_b_name}`}
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
        title="New pipeline deal"
        onClose={closeForm}
      >
        <form
          onSubmit={onSubmitForm}
          className="space-y-3 p-4"
          key="new-deal"
        >
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
                <span className="font-medium text-charcoal">Opportunities</span>{" "}
                first.
              </p>
            ) : null}
          </div>
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
              disabled={formBusy}
              className={WORKSPACE_FORM_BTN_PRIMARY}
            >
              {formBusy ? "Saving…" : "Add deal"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>
    </div>
  );
}
