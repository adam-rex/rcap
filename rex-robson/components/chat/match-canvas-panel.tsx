"use client";

import { Plus } from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type MatchKind,
  type MatchOutcome,
  type MatchStage,
  type WorkspaceMatchPageRow,
} from "@/lib/data/workspace-matches-page.types";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

type ApiOk = { rows: WorkspaceMatchPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

type StageHistoryRow = {
  id: number;
  match_id: string;
  from_stage: MatchStage | null;
  to_stage: MatchStage;
  changed_by: string | null;
  changed_at: string;
};

const STAGES: { id: MatchStage; label: string; description: string }[] = [
  {
    id: "introduced",
    label: "Introduced",
    description: "Intro sent, awaiting first reply",
  },
  {
    id: "active",
    label: "Active",
    description: "Conversation live between both sides",
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

function stageLabel(stage: MatchStage | null | undefined) {
  return STAGES.find((s) => s.id === stage)?.label ?? "Introduced";
}

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

type ContactOption = Pick<
  WorkspaceContactPageRow,
  "id" | "name" | "contact_type"
>;

// Match canvas is a kanban view — fetch every match in one shot so each stage
// column scrolls instead of paginating across 8-row pages.
const MATCH_CANVAS_PAGE_SIZE = 500;

export function MatchCanvasPanel() {
  const pageSize = MATCH_CANVAS_PAGE_SIZE;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rows, setRows] = useState<WorkspaceMatchPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [stageMoveBusyId, setStageMoveBusyId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<MatchStage | null>(null);
  const [dropPulseStage, setDropPulseStage] = useState<MatchStage | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const [fContactA, setFContactA] = useState("");
  const [fContactB, setFContactB] = useState("");
  const [fKind, setFKind] = useState<MatchKind>("founder_investor");
  const [fStage, setFStage] = useState<MatchStage>("introduced");
  const [fOutcome, setFOutcome] = useState<MatchOutcome | "">("");
  const [fContext, setFContext] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([]);

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
      const res = await fetch(`/api/workspace/matches?${params.toString()}`);
      const data = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load matches.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading matches.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, pageSize]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  const ensureContactsLoaded = useCallback(async () => {
    if (contactOptions.length > 0 || contactsLoading) return;
    setContactsLoading(true);
    try {
      const res = await fetch("/api/workspace/contacts?page=1&pageSize=50");
      const data = (await res.json()) as {
        rows?: WorkspaceContactPageRow[];
      };
      if (res.ok && Array.isArray(data.rows)) {
        setContactOptions(
          data.rows.map((r) => ({
            id: r.id,
            name: r.name,
            contact_type: r.contact_type,
          })),
        );
      }
    } catch {
      // network error swallowed; user can retry by reopening the dialog
    } finally {
      setContactsLoading(false);
    }
  }, [contactOptions.length, contactsLoading]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setDetailLoading(false);
    setFContactA("");
    setFContactB("");
    setFKind("founder_investor");
    setFStage("introduced");
    setFOutcome("");
    setFContext("");
    setFNotes("");
    setStageHistory([]);
    setFormError(null);
    setFormOpen(true);
    void ensureContactsLoaded();
  };

  const openEdit = useCallback(
    async (m: WorkspaceMatchPageRow) => {
      setFormMode("edit");
      setEditingId(m.id);
      setFormError(null);
      setFormOpen(true);
      setDetailLoading(true);
      setFContactA(m.contact_a_id);
      setFContactB(m.contact_b_id);
      setFKind(m.kind);
      setFStage(m.stage);
      setFOutcome(m.outcome ?? "");
      setFContext(m.context ?? "");
      setFNotes(m.notes ?? "");
      setStageHistory([]);
      void ensureContactsLoaded();
      try {
        const res = await fetch(`/api/workspace/matches/${m.id}`);
        const data = (await res.json()) as {
          error?: string;
          contactAId?: string;
          contactBId?: string;
          kind?: MatchKind;
          stage?: MatchStage;
          outcome?: MatchOutcome | null;
          context?: string | null;
          notes?: string | null;
          stageHistory?: StageHistoryRow[];
        };
        if (!res.ok) {
          setFormError(
            typeof data.error === "string" && data.error.length > 0
              ? data.error
              : "Could not load match.",
          );
          return;
        }
        if (data.contactAId) setFContactA(data.contactAId);
        if (data.contactBId) setFContactB(data.contactBId);
        if (data.kind) setFKind(data.kind);
        if (data.stage) setFStage(data.stage);
        setFOutcome(data.outcome ?? "");
        setFContext(data.context ?? "");
        setFNotes(data.notes ?? "");
        setStageHistory(
          Array.isArray(data.stageHistory) ? data.stageHistory : [],
        );
      } catch {
        setFormError("Network error while loading match.");
      } finally {
        setDetailLoading(false);
      }
    },
    [ensureContactsLoaded],
  );

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
    setEditingId(null);
    setDetailLoading(false);
    setStageHistory([]);
  };

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (detailLoading) return;
    if (!fContactA || !fContactB) {
      setFormError("Pick two contacts.");
      return;
    }
    if (fContactA === fContactB) {
      setFormError("Contacts must be different.");
      return;
    }
    if (fStage === "closed" && !fOutcome) {
      setFormError("Pick an outcome to close this match.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    const payload = {
      contactAId: fContactA,
      contactBId: fContactB,
      kind: fKind,
      stage: fStage,
      outcome: fStage === "closed" ? fOutcome || null : null,
      context: fContext.trim() === "" ? null : fContext.trim(),
      notes: fNotes.trim() === "" ? null : fNotes.trim(),
    };
    try {
      const isEdit = formMode === "edit" && editingId != null;
      const res = await fetch(
        isEdit
          ? `/api/workspace/matches/${editingId}`
          : "/api/workspace/matches",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setFormError(parts.length > 0 ? parts.join(" ") : "Could not save.");
        return;
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
      matchId: string,
      toStage: MatchStage,
      outcome: MatchOutcome | null = null,
    ) => {
      const source = rows.find((r) => r.id === matchId);
      if (!source) return;
      if (source.stage === toStage && source.outcome === outcome) return;
      if (toStage === "closed" && !outcome) {
        // Surface the outcome picker via the edit drawer rather than failing silently.
        void openEdit({ ...source, stage: "closed" });
        return;
      }

      const previousRows = rows;
      setRows((prev) =>
        prev.map((row) =>
          row.id === matchId
            ? { ...row, stage: toStage, outcome: toStage === "closed" ? outcome : null }
            : row,
        ),
      );
      setStageMoveBusyId(matchId);
      setError(null);
      try {
        const res = await fetch(`/api/workspace/matches/${matchId}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: toStage, outcome }),
        });
        const data = (await res.json()) as ApiErr;
        if (!res.ok) {
          setRows(previousRows);
          setError(data.error ?? "Could not move match stage.");
          return;
        }
      } catch {
        setRows(previousRows);
        setError("Network error while moving match stage.");
      } finally {
        setStageMoveBusyId(null);
      }
    },
    [openEdit, rows],
  );

  const onCardDragStart = (e: DragEvent<HTMLDivElement>, matchId: string) => {
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
    e.dataTransfer.setData("text/plain", matchId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(matchId);
  };

  const onCardDragEnd = () => {
    setDraggingId(null);
    setDropStage(null);
  };

  const onColumnDragOver = (e: DragEvent<HTMLElement>, stage: MatchStage) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStage(stage);
  };

  const onColumnDragLeave = (
    e: DragEvent<HTMLElement>,
    stage: MatchStage,
  ) => {
    if (dropStage !== stage) return;
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setDropStage(null);
  };

  const onColumnDrop = async (e: DragEvent<HTMLElement>, stage: MatchStage) => {
    e.preventDefault();
    const matchId = e.dataTransfer.getData("text/plain") || draggingId;
    setDropStage(null);
    if (!matchId || stageMoveBusyId) return;
    const source = rows.find((r) => r.id === matchId);
    if (!source || source.stage === stage) return;
    setDropPulseStage(stage);
    window.setTimeout(
      () => setDropPulseStage((s) => (s === stage ? null : s)),
      180,
    );
    await moveStage(matchId, stage);
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
              Match canvas
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No matches for that search."
                    : "No matches yet — accept a suggestion or pair two contacts."
                  : `${total} match${total === 1 ? "" : "es"} across all stages`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            New match
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search matches</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search: contact names, context, notes…"
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
        <div className="grid min-w-[820px] grid-cols-3 gap-3">
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
                    No matches in this stage.
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
                        aria-label={`Edit match between ${m.contact_a_name} and ${m.contact_b_name}`}
                      >
                        <p className="text-sm font-medium text-charcoal">
                          {m.contact_a_name}{" "}
                          <span className="text-charcoal-light/70">↔</span>{" "}
                          {m.contact_b_name}
                        </p>
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
        title={formMode === "create" ? "New match" : "Edit match"}
        onClose={closeForm}
      >
        <form
          onSubmit={onSubmitForm}
          className="space-y-3 p-4"
          key={`${formMode}-${editingId ?? "new"}`}
        >
          {detailLoading ? (
            <p className="py-6 text-center text-sm text-charcoal-light">
              Loading match…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="match-form-contact-a"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Contact A
                  </label>
                  <select
                    id="match-form-contact-a"
                    required
                    disabled={formMode === "edit"}
                    value={fContactA}
                    onChange={(e) => setFContactA(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                  >
                    <option value="">— pick contact —</option>
                    {contactOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.contact_type ? ` · ${c.contact_type}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="match-form-contact-b"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Contact B
                  </label>
                  <select
                    id="match-form-contact-b"
                    required
                    disabled={formMode === "edit"}
                    value={fContactB}
                    onChange={(e) => setFContactB(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                  >
                    <option value="">— pick contact —</option>
                    {contactOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.contact_type ? ` · ${c.contact_type}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {formMode === "edit" ? (
                <p className="text-[11px] text-charcoal-light/70">
                  Contacts are locked on an existing match. Create a new match if
                  the pairing is different.
                </p>
              ) : null}
              {contactsLoading ? (
                <p className="text-[11px] text-charcoal-light/70">
                  Loading contacts…
                </p>
              ) : null}
              <div>
                <label
                  htmlFor="match-form-kind"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Kind
                </label>
                <select
                  id="match-form-kind"
                  value={fKind}
                  onChange={(e) => setFKind(e.target.value as MatchKind)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                >
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="match-form-stage"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Stage
                  </label>
                  <select
                    id="match-form-stage"
                    value={fStage}
                    onChange={(e) => {
                      const next = e.target.value as MatchStage;
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
                    htmlFor="match-form-outcome"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Outcome {fStage === "closed" ? "*" : "(closed only)"}
                  </label>
                  <select
                    id="match-form-outcome"
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
                  htmlFor="match-form-context"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Context
                </label>
                <textarea
                  id="match-form-context"
                  value={fContext}
                  onChange={(e) => setFContext(e.target.value)}
                  rows={3}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="Why these two? Sector, cheque size, intro reason."
                />
              </div>
              <div>
                <label
                  htmlFor="match-form-notes"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Notes
                </label>
                <textarea
                  id="match-form-notes"
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  rows={2}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="Internal-only notes."
                />
              </div>
              {formMode === "edit" ? (
                <div>
                  <p className={WORKSPACE_FORM_LABEL_CLASS}>Stage history</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-charcoal/10 bg-cream-light/30 p-2">
                    {stageHistory.length === 0 ? (
                      <p className="text-xs text-charcoal-light/80">
                        No stage changes yet.
                      </p>
                    ) : (
                      stageHistory.map((row) => (
                        <p
                          key={row.id}
                          className="text-xs text-charcoal-light/90"
                        >
                          {row.from_stage
                            ? `${stageLabel(row.from_stage)} → `
                            : "Created at "}
                          {stageLabel(row.to_stage)}{" "}
                          <span className="text-charcoal-light/70">
                            {new Date(row.changed_at).toLocaleString()}
                            {row.changed_by ? ` by ${row.changed_by}` : ""}
                          </span>
                        </p>
                      ))
                    )}
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
                  ? "Add match"
                  : "Save changes"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>
    </div>
  );
}
