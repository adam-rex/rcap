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
  WORKSPACE_BROWSE_ROW_BUTTON_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

function muted(line: string | null | undefined) {
  if (line == null || line === "") return null;
  return (
    <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/85">
      {line}
    </p>
  );
}

type ApiOk = { rows: WorkspaceDealPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

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
  const [newSector, setNewSector] = useState("");
  const [newStructure, setNewStructure] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [newNotes, setNewNotes] = useState("");

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
    setNewSector("");
    setNewStructure("");
    setNewStatus("");
    setNewNotes("");
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
    try {
      const res = await fetch(`/api/workspace/deals/${d.id}`);
      const data = (await res.json()) as {
        error?: string;
        title?: string;
        size?: number | null;
        dealType?: string | null;
        sector?: string | null;
        structure?: string | null;
        status?: string | null;
        notes?: string | null;
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
      setNewSector(data.sector ?? "");
      setNewStructure(data.structure ?? "");
      setNewStatus(data.status ?? "");
      setNewNotes(data.notes ?? "");
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

      <div className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream-light/40">
        <ul className="divide-y divide-charcoal/[0.06]">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <li key={i} className="animate-pulse px-4 py-4">
                  <div className="h-4 w-56 rounded bg-charcoal/10" />
                  <div className="mt-2 h-3 w-40 rounded bg-charcoal/5" />
                  <div className="mt-2 h-3 w-full max-w-md rounded bg-charcoal/[0.04]" />
                </li>
              ))
            : rows.map((d) => {
                const meta = [d.deal_type, d.sector, d.structure, d.status]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => void openEdit(d)}
                      className={WORKSPACE_BROWSE_ROW_BUTTON_CLASS}
                      aria-label={`Edit ${d.title}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-charcoal">{d.title}</p>
                        {d.size != null ? (
                          <p className="mt-0.5 text-xs text-charcoal-light/85">
                            Size {d.size.toLocaleString()}
                          </p>
                        ) : null}
                        {muted(meta || null)}
                      </div>
                    </button>
                  </li>
                );
              })}
        </ul>
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
