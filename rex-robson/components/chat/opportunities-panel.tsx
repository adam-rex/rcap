"use client";

import { Handshake, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { MatchKind } from "@/lib/data/workspace-matches-page.types";
import type { WorkspaceOpportunityRow } from "@/lib/data/workspace-opportunities-page";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

const KIND_LABEL: Record<MatchKind, string> = {
  founder_investor: "Founder · Investor",
  founder_lender: "Founder · Lender",
};

type ContactOption = Pick<
  WorkspaceContactPageRow,
  "id" | "name" | "contact_type"
>;

function formatIntroAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function OpportunitiesPanel() {
  const [rows, setRows] = useState<WorkspaceOpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [dealOpen, setDealOpen] = useState(false);
  const [dealMatchId, setDealMatchId] = useState<string | null>(null);
  const [dealTitle, setDealTitle] = useState("");
  const [dealContext, setDealContext] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [dealBusy, setDealBusy] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);

  const [introOpen, setIntroOpen] = useState(false);
  const [introMatchId, setIntroMatchId] = useState<string | null>(null);
  const [introAt, setIntroAt] = useState("");
  const [introNotes, setIntroNotes] = useState("");
  const [introBusy, setIntroBusy] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);

  const [newOppOpen, setNewOppOpen] = useState(false);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [noContactA, setNoContactA] = useState("");
  const [noContactB, setNoContactB] = useState("");
  const [noKind, setNoKind] = useState<MatchKind>("founder_investor");
  const [noContext, setNoContext] = useState("");
  const [noBusy, setNoBusy] = useState(false);
  const [noError, setNoError] = useState<string | null>(null);

  const [pendingUndo, setPendingUndo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/opportunities");
      const data = (await res.json()) as {
        rows?: WorkspaceOpportunityRow[];
        error?: string;
      };
      if (!res.ok) {
        setRows([]);
        setError(data.error ?? "Could not load opportunities.");
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setRows([]);
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const ensureContacts = useCallback(async () => {
    if (contactOptions.length > 0 || contactsLoading) return;
    setContactsLoading(true);
    try {
      const res = await fetch("/api/workspace/contacts?page=1&pageSize=80");
      const data = (await res.json()) as { rows?: WorkspaceContactPageRow[] };
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
      /* ignore */
    } finally {
      setContactsLoading(false);
    }
  }, [contactOptions.length, contactsLoading]);

  const openNewOpportunity = () => {
    setNoContactA("");
    setNoContactB("");
    setNoKind("founder_investor");
    setNoContext("");
    setNoError(null);
    setNewOppOpen(true);
    void ensureContacts();
  };

  const onCreateOpportunity = async (e: FormEvent) => {
    e.preventDefault();
    if (!noContactA || !noContactB || noContactA === noContactB) {
      setNoError("Pick two different contacts.");
      return;
    }
    setNoBusy(true);
    setNoError(null);
    try {
      const res = await fetch("/api/workspace/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactAId: noContactA,
          contactBId: noContactB,
          kind: noKind,
          stage: "introduced",
          outcome: null,
          context: noContext.trim() === "" ? null : noContext.trim(),
          notes: null,
        }),
      });
      const data = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setNoError(parts.length > 0 ? parts.join(" ") : "Could not save.");
        return;
      }
      setNewOppOpen(false);
      setToast("Opportunity added.");
      await load();
    } catch {
      setNoError("Network error.");
    } finally {
      setNoBusy(false);
    }
  };

  const openAddDeal = (matchId: string) => {
    setDealMatchId(matchId);
    setDealTitle("");
    setDealContext("");
    setDealNotes("");
    setDealError(null);
    setDealOpen(true);
  };

  const onSubmitDeal = async (e: FormEvent) => {
    e.preventDefault();
    if (!dealMatchId) return;
    setDealBusy(true);
    setDealError(null);
    try {
      const res = await fetch("/api/workspace/match-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: dealMatchId,
          title: dealTitle.trim() === "" ? null : dealTitle.trim(),
          context: dealContext.trim() === "" ? null : dealContext.trim(),
          notes: dealNotes.trim() === "" ? null : dealNotes.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDealError(data.error ?? "Could not create deal.");
        return;
      }
      setDealOpen(false);
      setToast("Deal added to Pipeline.");
      await load();
    } catch {
      setDealError("Network error.");
    } finally {
      setDealBusy(false);
    }
  };

  const openEditIntro = (o: WorkspaceOpportunityRow) => {
    setIntroMatchId(o.id);
    setIntroAt(
      o.introduction_at
        ? new Date(o.introduction_at).toISOString().slice(0, 16)
        : "",
    );
    setIntroNotes(o.introduction_notes ?? "");
    setIntroError(null);
    setIntroOpen(true);
  };

  const onSaveIntro = async (e: FormEvent) => {
    e.preventDefault();
    if (!introMatchId) return;
    setIntroBusy(true);
    setIntroError(null);
    try {
      const res = await fetch(
        `/api/workspace/matches/${encodeURIComponent(introMatchId)}/introduction`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            introductionAt:
              introAt.trim() === "" ? null : new Date(introAt).toISOString(),
            introductionNotes:
              introNotes.trim() === "" ? null : introNotes.trim(),
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setIntroError(data.error ?? "Could not update.");
        return;
      }
      setIntroOpen(false);
      setToast("Introduction details saved.");
      await load();
    } catch {
      setIntroError("Network error.");
    } finally {
      setIntroBusy(false);
    }
  };

  const onUndo = async (matchId: string) => {
    if (pendingUndo) return;
    setPendingUndo(matchId);
    try {
      const res = await fetch(
        `/api/workspace/matches/${encodeURIComponent(matchId)}/undo-introduction`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not undo introduction.");
        return;
      }
      setToast("Introduction reverted — suggestion is live again if it came from Rex.");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setPendingUndo(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8">
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Opportunities
            </h2>
            <p className="mt-1 max-w-xl text-xs text-charcoal-light/80">
              Profile-fit pairs you&apos;ve introduced. Start specific deals from
              here — each deal shows up on the Pipeline board.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewOpportunity}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-charcoal/15 bg-cream-light/60 px-3 py-2 text-xs font-medium text-charcoal transition-colors hover:bg-charcoal hover:text-cream"
          >
            <Plus className="size-3.5" aria-hidden />
            New introduction
          </button>
        </div>
      </div>

      {toast ? (
        <div
          className="mb-3 shrink-0 rounded-lg border border-charcoal/[0.12] bg-charcoal/[0.04] px-3 py-2 text-xs text-charcoal"
          role="status"
        >
          {toast}
        </div>
      ) : null}
      {error ? (
        <div
          className="mb-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-charcoal-light">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-start justify-start rounded-xl border border-dashed border-charcoal/15 bg-cream-light/40 p-6">
          <span className="flex size-9 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
            <Handshake className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal">
            No introductions yet. Mark a profile match under Suggestions as{" "}
            <span className="font-medium">Made introduction</span>, or add
            one manually.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-charcoal/[0.08] bg-cream-light/40">
          <ul className="divide-y divide-charcoal/[0.06]">
            {rows.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-charcoal">
                    {o.contact_a_name}{" "}
                    <span className="text-charcoal-light/70">↔</span>{" "}
                    {o.contact_b_name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-charcoal/15 bg-charcoal/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-charcoal">
                      {KIND_LABEL[o.kind]}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-charcoal/10 bg-cream px-2 py-0.5 text-[10px] font-medium text-charcoal-light">
                      <Sparkles className="size-3" aria-hidden />
                      {o.transaction_count} deal
                      {o.transaction_count === 1 ? "" : "s"} on pipeline
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-charcoal-light/80">
                    Introduced {formatIntroAt(o.introduction_at)}
                  </p>
                  {o.introduction_notes ? (
                    <p className="mt-1 text-xs text-charcoal-light/85">
                      {o.introduction_notes}
                    </p>
                  ) : null}
                  {o.context ? (
                    <p className="mt-2 line-clamp-3 text-xs text-charcoal-light/80">
                      {o.context}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openAddDeal(o.id)}
                    className="rounded-lg border border-charcoal/12 bg-charcoal px-2.5 py-1.5 text-[11px] font-medium text-cream transition-colors hover:bg-charcoal/90"
                  >
                    Add deal
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditIntro(o)}
                    className="inline-flex items-center gap-1 rounded-lg border border-charcoal/12 bg-cream-light/60 px-2.5 py-1.5 text-[11px] font-medium text-charcoal transition-colors hover:bg-charcoal/5"
                    aria-label="Edit introduction details"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit intro
                  </button>
                  <button
                    type="button"
                    disabled={
                      pendingUndo === o.id || o.transaction_count > 0
                    }
                    onClick={() => void onUndo(o.id)}
                    title={
                      o.transaction_count > 0
                        ? "Remove pipeline deals first"
                        : "Undo introduction"
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-charcoal/12 bg-cream-light/60 px-2.5 py-1.5 text-[11px] font-medium text-charcoal-light transition-colors hover:border-red-400/40 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Undo
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <WorkspaceCreateDialog
        open={dealOpen}
        title="Add pipeline deal"
        onClose={() => {
          if (!dealBusy) setDealOpen(false);
        }}
      >
        <form className="space-y-3 p-4" onSubmit={onSubmitDeal}>
          <p className="text-xs text-charcoal-light">
            Creates a transaction on the Pipeline for this introduction.
          </p>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="opp-deal-title">
              Label (optional)
            </label>
            <input
              id="opp-deal-title"
              className={WORKSPACE_FORM_INPUT_CLASS}
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              placeholder="Series A, venture debt…"
            />
          </div>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="opp-deal-ctx">
              Context
            </label>
            <textarea
              id="opp-deal-ctx"
              rows={3}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              value={dealContext}
              onChange={(e) => setDealContext(e.target.value)}
            />
          </div>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="opp-deal-notes">
              Notes
            </label>
            <textarea
              id="opp-deal-notes"
              rows={2}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              value={dealNotes}
              onChange={(e) => setDealNotes(e.target.value)}
            />
          </div>
          {dealError ? (
            <p className="text-sm text-red-700" role="alert">
              {dealError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={WORKSPACE_FORM_BTN_SECONDARY}
              disabled={dealBusy}
              onClick={() => setDealOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className={WORKSPACE_FORM_BTN_PRIMARY} disabled={dealBusy}>
              {dealBusy ? "Saving…" : "Add deal"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>

      <WorkspaceCreateDialog
        open={introOpen}
        title="Introduction details"
        onClose={() => {
          if (!introBusy) setIntroOpen(false);
        }}
      >
        <form className="space-y-3 p-4" onSubmit={onSaveIntro}>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="intro-when">
              When
            </label>
            <input
              id="intro-when"
              type="datetime-local"
              className={WORKSPACE_FORM_INPUT_CLASS}
              value={introAt}
              onChange={(e) => setIntroAt(e.target.value)}
            />
          </div>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="intro-notes">
              Notes
            </label>
            <textarea
              id="intro-notes"
              rows={3}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              value={introNotes}
              onChange={(e) => setIntroNotes(e.target.value)}
            />
          </div>
          {introError ? (
            <p className="text-sm text-red-700" role="alert">
              {introError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={WORKSPACE_FORM_BTN_SECONDARY}
              disabled={introBusy}
              onClick={() => setIntroOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className={WORKSPACE_FORM_BTN_PRIMARY} disabled={introBusy}>
              {introBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>

      <WorkspaceCreateDialog
        open={newOppOpen}
        title="New introduction"
        onClose={() => {
          if (!noBusy) setNewOppOpen(false);
        }}
      >
        <form className="space-y-3 p-4" onSubmit={onCreateOpportunity}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="no-a">
                Contact A
              </label>
              <select
                id="no-a"
                required
                className={WORKSPACE_FORM_INPUT_CLASS}
                value={noContactA}
                onChange={(e) => setNoContactA(e.target.value)}
              >
                <option value="">— pick —</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.contact_type ? ` · ${c.contact_type}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="no-b">
                Contact B
              </label>
              <select
                id="no-b"
                required
                className={WORKSPACE_FORM_INPUT_CLASS}
                value={noContactB}
                onChange={(e) => setNoContactB(e.target.value)}
              >
                <option value="">— pick —</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.contact_type ? ` · ${c.contact_type}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {contactsLoading ? (
            <p className="text-[11px] text-charcoal-light/70">Loading contacts…</p>
          ) : null}
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="no-kind">
              Kind
            </label>
            <select
              id="no-kind"
              className={WORKSPACE_FORM_INPUT_CLASS}
              value={noKind}
              onChange={(e) => setNoKind(e.target.value as MatchKind)}
            >
              <option value="founder_investor">Founder · Investor</option>
              <option value="founder_lender">Founder · Lender</option>
            </select>
          </div>
          <div>
            <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="no-ctx">
              Why they fit (optional)
            </label>
            <textarea
              id="no-ctx"
              rows={3}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              value={noContext}
              onChange={(e) => setNoContext(e.target.value)}
            />
          </div>
          {noError ? (
            <p className="text-sm text-red-700" role="alert">
              {noError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={WORKSPACE_FORM_BTN_SECONDARY}
              disabled={noBusy}
              onClick={() => setNewOppOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className={WORKSPACE_FORM_BTN_PRIMARY} disabled={noBusy}>
              {noBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </WorkspaceCreateDialog>
    </div>
  );
}
