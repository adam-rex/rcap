"use client";

import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  WORKSPACE_DEALS_PAGE_SIZE_DEFAULT,
  type WorkspaceDealPageRow,
} from "@/lib/data/workspace-deals-page.types";
import { WorkspaceBrowsePagination } from "./workspace-browse-pagination";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

type ApiOk = { rows: WorkspaceDealPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };
type DealStage = WorkspaceDealPageRow["deal_stage"];
type StageHistoryRow = {
  id: number;
  deal_id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_at: string;
};

const STAGES: { id: DealStage; label: string }[] = [
  { id: "prospect", label: "Prospect" },
  { id: "active", label: "Active" },
  { id: "matching", label: "Matching" },
  { id: "closed", label: "Closed" },
];

function fmtMoney(size: number | null) {
  if (size == null) return null;
  if (size >= 1_000_000) return `£${Math.round(size / 100_000) / 10}M`;
  if (size >= 1_000) return `£${Math.round(size / 100) / 10}K`;
  return `£${Math.round(size)}`;
}

function stageLabel(stage: DealStage | null | undefined) {
  return STAGES.find((s) => s.id === stage)?.label ?? "Prospect";
}

export function DealsBrowsePanel() {
  const pageSize = WORKSPACE_DEALS_PAGE_SIZE_DEFAULT;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WorkspaceDealPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newDealType, setNewDealType] = useState("");
  const [newDealStage, setNewDealStage] = useState<DealStage>("prospect");
  const [newSector, setNewSector] = useState("");
  const [newStructure, setNewStructure] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [stageMoveBusyId, setStageMoveBusyId] = useState<string | null>(null);
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedQuery !== "") {
      params.set("q", debouncedQuery);
    }
    try {
      const res = await fetch(`/api/workspace/deals?${params.toString()}`);
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
  }, [page, debouncedQuery, pageSize]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  useEffect(() => {
    if (page !== safePage && safePage >= 1) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setDetailLoading(false);
    setNewTitle("");
    setNewSize("");
    setNewDealType("");
    setNewDealStage("prospect");
    setNewSector("");
    setNewStructure("");
    setNewStatus("");
    setNewNotes("");
    setStageHistory([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = async (d: WorkspaceDealPageRow) => {
    setFormMode("edit");
    setEditingId(d.id);
    setFormError(null);
    setFormOpen(true);
    setDetailLoading(true);
    setNewTitle("");
    setNewSize("");
    setNewDealType("");
    setNewSector("");
    setNewStructure("");
    setNewStatus("");
    setNewNotes("");
    setStageHistory([]);
    try {
      const res = await fetch(`/api/workspace/deals/${d.id}`);
      const data = (await res.json()) as {
        error?: string;
        title?: string;
        size?: number | null;
        dealType?: string | null;
        dealStage?: DealStage;
        sector?: string | null;
        structure?: string | null;
        status?: string | null;
        notes?: string | null;
        stageHistory?: StageHistoryRow[];
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string" && data.error.length > 0
            ? data.error
            : "Could not load deal.";
        setFormError(msg);
        return;
      }
      setNewTitle(data.title ?? "");
      setNewSize(
        data.size != null && Number.isFinite(Number(data.size))
          ? String(data.size)
          : "",
      );
      setNewDealType(data.dealType ?? "");
      setNewDealStage(
        data.dealStage === "active" ||
          data.dealStage === "matching" ||
          data.dealStage === "closed"
          ? data.dealStage
          : "prospect",
      );
      setNewSector(data.sector ?? "");
      setNewStructure(data.structure ?? "");
      setNewStatus(data.status ?? "");
      setNewNotes(data.notes ?? "");
      setStageHistory(Array.isArray(data.stageHistory) ? data.stageHistory : []);
    } catch {
      setFormError("Network error while loading deal.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
    setEditingId(null);
    setDetailLoading(false);
    setStageHistory([]);
  };

  const onSubmitDeal = async (e: FormEvent) => {
    e.preventDefault();
    if (detailLoading) return;
    setFormBusy(true);
    setFormError(null);
    const payload = {
      title: newTitle,
      size: newSize.trim() === "" ? null : newSize.trim(),
      dealType: newDealType.trim() === "" ? null : newDealType.trim(),
      dealStage: newDealStage,
      sector: newSector.trim() === "" ? null : newSector.trim(),
      structure: newStructure.trim() === "" ? null : newStructure.trim(),
      status: newStatus.trim() === "" ? null : newStatus.trim(),
      notes: newNotes.trim() === "" ? null : newNotes.trim(),
    };
    try {
      const isEdit = formMode === "edit" && editingId != null;
      const res = await fetch(
        isEdit ? `/api/workspace/deals/${editingId}` : "/api/workspace/deals",
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
      if (formMode === "create") setPage(1);
      setReloadTick((n) => n + 1);
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setFormBusy(false);
    }
  };

  const moveStage = async (dealId: string, toStage: DealStage) => {
    setStageMoveBusyId(dealId);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/deals/${dealId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealStage: toStage }),
      });
      const data = (await res.json()) as ApiErr;
      if (!res.ok) {
        setError(data.error ?? "Could not move deal stage.");
        return;
      }
      setReloadTick((n) => n + 1);
      if (editingId === dealId && formOpen) {
        void openEdit({ id: dealId, title: "", size: null, deal_type: null, deal_stage: toStage, sector: null, structure: null, status: null });
      }
    } catch {
      setError("Network error while moving deal stage.");
    } finally {
      setStageMoveBusyId(null);
    }
  };

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Deal canvas
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No matches for that search."
                    : "No open deals."
                  : `Showing ${from}–${to} of ${total} open deal${total === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            Add deal
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search deals</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Deep search: title, sector, structure, status, notes, size…"
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
        <div className="grid min-w-[920px] grid-cols-4 gap-3">
          {STAGES.map((stage) => {
            const stageRows = rows.filter((d) => d.deal_stage === stage.id);
            return (
              <section
                key={stage.id}
                className="rounded-lg border border-charcoal/8 bg-cream p-2"
              >
                <div className="mb-2 flex items-center justify-between border-b border-charcoal/8 px-1 pb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/80">
                    {stage.label}
                  </p>
                  <span className="text-xs text-charcoal-light/80">{stageRows.length}</span>
                </div>
                <div className="space-y-2">
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-md border border-charcoal/10 p-3">
                        <div className="h-4 w-32 rounded bg-charcoal/10" />
                        <div className="mt-2 h-3 w-20 rounded bg-charcoal/5" />
                      </div>
                    ))
                  ) : stageRows.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-charcoal-light/70">No deals in this stage.</p>
                  ) : (
                    stageRows.map((d) => {
                      const meta = [d.deal_type, d.sector, d.structure].filter(Boolean).join(" · ");
                      const money = fmtMoney(d.size);
                      return (
                        <div key={d.id} className="rounded-md border border-charcoal/10 bg-cream-light/30 p-3">
                          <button
                            type="button"
                            onClick={() => void openEdit(d)}
                            className="w-full text-left"
                            aria-label={`Edit ${d.title}`}
                          >
                            <p className="text-sm font-medium text-charcoal">{d.title}</p>
                            {money ? (
                              <p className="mt-0.5 text-xs font-medium text-charcoal">{money}</p>
                            ) : null}
                            {meta ? (
                              <p className="mt-1 line-clamp-2 text-xs text-charcoal-light/85">{meta}</p>
                            ) : null}
                          </button>
                          <div className="mt-2 flex items-center gap-1.5">
                            {STAGES.filter((x) => x.id !== d.deal_stage).map((target) => (
                              <button
                                key={target.id}
                                type="button"
                                disabled={stageMoveBusyId === d.id}
                                onClick={() => void moveStage(d.id, target.id)}
                                className="rounded border border-charcoal/15 px-1.5 py-1 text-[11px] text-charcoal-light transition-colors hover:bg-charcoal/5 disabled:opacity-50"
                              >
                                {target.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <WorkspaceBrowsePagination
        ariaLabel="Deal canvas pagination"
        safePage={safePage}
        totalPages={totalPages}
        loading={loading}
        onPageChange={setPage}
      />

      <WorkspaceCreateDialog
        open={formOpen}
        title={formMode === "create" ? "New deal" : "Edit deal"}
        onClose={closeForm}
      >
        <form
          onSubmit={onSubmitDeal}
          className="space-y-3 p-4"
          key={`${formMode}-${editingId ?? "new"}`}
        >
          {detailLoading ? (
            <p className="py-6 text-center text-sm text-charcoal-light">
              Loading deal…
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="deal-form-title"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Title
                </label>
                <input
                  id="deal-form-title"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="Deal or opportunity name"
                />
              </div>
              <div>
                <label
                  htmlFor="deal-form-size"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Size
                </label>
                <input
                  id="deal-form-size"
                  type="text"
                  inputMode="decimal"
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="Optional numeric size"
                />
              </div>
              <div>
                <label
                  htmlFor="deal-form-deal-type"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Deal type
                </label>
                <input
                  id="deal-form-deal-type"
                  value={newDealType}
                  onChange={(e) => setNewDealType(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="e.g. Equity deal, Senior debt, Bridging"
                />
              </div>
              <div>
                <label
                  htmlFor="deal-form-stage"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Stage
                </label>
                <select
                  id="deal-form-stage"
                  value={newDealStage}
                  onChange={(e) =>
                    setNewDealStage(e.target.value as DealStage)
                  }
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
                  htmlFor="deal-form-sector"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Sector
                </label>
                <input
                  id="deal-form-sector"
                  value={newSector}
                  onChange={(e) => setNewSector(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
              <div>
                <p className={WORKSPACE_FORM_LABEL_CLASS}>Stage history</p>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-charcoal/10 bg-cream-light/30 p-2">
                  {stageHistory.length === 0 ? (
                    <p className="text-xs text-charcoal-light/80">No stage changes yet.</p>
                  ) : (
                    stageHistory.map((row) => (
                      <p key={row.id} className="text-xs text-charcoal-light/90">
                        {stageLabel(row.from_stage)} → {stageLabel(row.to_stage)}{" "}
                        <span className="text-charcoal-light/70">
                          {new Date(row.changed_at).toLocaleString()}
                          {row.changed_by ? ` by ${row.changed_by}` : ""}
                        </span>
                      </p>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label
                  htmlFor="deal-form-structure"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Structure
                </label>
                <input
                  id="deal-form-structure"
                  value={newStructure}
                  onChange={(e) => setNewStructure(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label
                  htmlFor="deal-form-status"
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Status
                </label>
                <input
                  id="deal-form-status"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  placeholder="Leave blank for open; use passed or closed to hide from canvas"
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
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={3}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="Optional"
                />
              </div>
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
