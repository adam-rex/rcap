"use client";

import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  WORKSPACE_ORGANISATIONS_PAGE_SIZE_DEFAULT,
  type WorkspaceOrganisationPageRow,
} from "@/lib/data/workspace-organisations-page.types";
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
    <p className="mt-0.5 line-clamp-3 text-xs text-charcoal-light/85">
      {line}
    </p>
  );
}

type ApiOk = { rows: WorkspaceOrganisationPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

export function OrganisationsBrowsePanel() {
  const pageSize = WORKSPACE_ORGANISATIONS_PAGE_SIZE_DEFAULT;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WorkspaceOrganisationPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newDescription, setNewDescription] = useState("");

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
      const res = await fetch(`/api/workspace/organisations?${params.toString()}`);
      const data = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load organisations.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading organisations.");
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
    setNewName("");
    setNewType("");
    setNewDescription("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (o: WorkspaceOrganisationPageRow) => {
    setFormMode("edit");
    setEditingId(o.id);
    setNewName(o.name);
    setNewType(o.type ?? "");
    setNewDescription(o.description ?? "");
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
    setEditingId(null);
  };

  const onSubmitOrganisation = async (e: FormEvent) => {
    e.preventDefault();
    setFormBusy(true);
    setFormError(null);
    const payload = {
      name: newName,
      type: newType.trim() === "" ? null : newType.trim(),
      description: newDescription.trim() === "" ? null : newDescription.trim(),
    };
    try {
      const isEdit = formMode === "edit" && editingId != null;
      const res = await fetch(
        isEdit
          ? `/api/workspace/organisations/${editingId}`
          : "/api/workspace/organisations",
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
    <div className="flex w-full min-w-0 flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Organisations
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No matches for that search."
                    : "No organisations yet."
                  : `Showing ${from}–${to} of ${total}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            Add organisation
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search organisations</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Deep search: name, type, description…"
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
                  <div className="h-4 w-48 rounded bg-charcoal/10" />
                  <div className="mt-2 h-3 w-32 rounded bg-charcoal/5" />
                  <div className="mt-2 h-10 w-full rounded bg-charcoal/[0.04]" />
                </li>
              ))
            : rows.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(o)}
                    className={WORKSPACE_BROWSE_ROW_BUTTON_CLASS}
                    aria-label={`Edit ${o.name}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-charcoal">{o.name}</p>
                      {muted(o.type)}
                      {muted(o.description)}
                    </div>
                  </button>
                </li>
              ))}
        </ul>
      </div>

      <WorkspaceBrowsePagination
        ariaLabel="Organisations pagination"
        safePage={safePage}
        totalPages={totalPages}
        loading={loading}
        onPageChange={setPage}
      />

      <WorkspaceCreateDialog
        open={formOpen}
        title={formMode === "create" ? "New organisation" : "Edit organisation"}
        onClose={closeForm}
      >
        <form onSubmit={onSubmitOrganisation} className="space-y-3 p-4">
          <div>
            <label htmlFor="org-new-name" className={WORKSPACE_FORM_LABEL_CLASS}>
              Name
            </label>
            <input
              id="org-new-name"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Company or fund name"
              autoComplete="organization"
            />
          </div>
          <div>
            <label htmlFor="org-new-type" className={WORKSPACE_FORM_LABEL_CLASS}>
              Type
            </label>
            <input
              id="org-new-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="e.g. LP, GP, advisor"
            />
          </div>
          <div>
            <label htmlFor="org-new-desc" className={WORKSPACE_FORM_LABEL_CLASS}>
              Description
            </label>
            <textarea
              id="org-new-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              placeholder="Optional context"
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
              {formBusy
                ? "Saving…"
                : formMode === "create"
                  ? "Add organisation"
                  : "Save changes"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>
    </div>
  );
}
