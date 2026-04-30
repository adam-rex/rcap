"use client";

import { Handshake, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import type React from "react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MatchKind } from "@/lib/data/workspace-matches-page.types";
import type { WorkspaceOpportunityRow } from "@/lib/data/workspace-opportunities-page";
import {
  WORKSPACE_CONTACTS_PAGE_SIZE_MAX,
  type WorkspaceContactPageRow,
} from "@/lib/data/workspace-contacts.types";
import { ContactPairGeographyLine } from "./contact-pair-geography";
import { createWhyFitMarkdownComponents } from "./match-context-markdown";
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

type OpportunitySortKey = "intro_desc" | "intro_asc" | "pair_az";

type PipelineFilter = "all" | "has" | "none";

const opportunityMarkdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-1 leading-relaxed" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-1 list-disc space-y-0.5 pl-4" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-4" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-charcoal" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-charcoal/[0.06] px-1 py-0.5 font-mono text-[0.92em]"
      {...props}
    />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg bg-charcoal/[0.06] p-2 font-mono text-[0.92em]"
      {...props}
    />
  ),
} as const;

const INTRO_NOTES_COLLAPSE_AFTER_CHARS = 220;

function formatIntroDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function introTime(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function pairSortKey(o: WorkspaceOpportunityRow): string {
  return `${o.contact_a_name}\n${o.contact_b_name}`.toLowerCase();
}

function rowSectorSet(o: WorkspaceOpportunityRow): Set<string> {
  const s = new Set<string>();
  if (o.contact_a_sector) s.add(o.contact_a_sector);
  if (o.contact_b_sector) s.add(o.contact_b_sector);
  return s;
}

type ContactOption = Pick<
  WorkspaceContactPageRow,
  "id" | "name" | "contact_type"
>;

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
  const [contactsPickerError, setContactsPickerError] = useState<string | null>(
    null,
  );
  const [noContactA, setNoContactA] = useState("");
  const [noContactB, setNoContactB] = useState("");
  const [noKind, setNoKind] = useState<MatchKind>("founder_investor");
  const [noContext, setNoContext] = useState("");
  const [noBusy, setNoBusy] = useState(false);
  const [noError, setNoError] = useState<string | null>(null);

  const [pendingUndo, setPendingUndo] = useState<string | null>(null);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterKind, setFilterKind] = useState<"all" | MatchKind>("all");
  const [filterPipeline, setFilterPipeline] = useState<PipelineFilter>("all");
  const [sortKey, setSortKey] =
    useState<OpportunitySortKey>("intro_desc");
  const [expandedIntroNotes, setExpandedIntroNotes] = useState<
    Record<string, boolean>
  >({});

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

  const uniqueSectors = useMemo(() => {
    const s = new Set<string>();
    for (const o of rows) {
      if (o.contact_a_sector) s.add(o.contact_a_sector);
      if (o.contact_b_sector) s.add(o.contact_b_sector);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const hasActiveFilters =
    filterSearch.trim().length > 0 ||
    filterSectors.length > 0 ||
    filterKind !== "all" ||
    filterPipeline !== "all";

  const clearFilters = useCallback(() => {
    setFilterSearch("");
    setFilterSectors([]);
    setFilterKind("all");
    setFilterPipeline("all");
  }, []);

  const filteredRows = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    let list = rows.filter((o) => {
      if (q.length > 0) {
        const hay = [
          o.contact_a_name,
          o.contact_b_name,
          o.introduction_notes ?? "",
          o.context ?? "",
        ]
          .join("\n")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterKind !== "all" && o.kind !== filterKind) return false;
      if (filterPipeline === "has" && o.transaction_count <= 0) return false;
      if (filterPipeline === "none" && o.transaction_count > 0) return false;
      if (filterSectors.length > 0) {
        const rs = rowSectorSet(o);
        const any = filterSectors.some((fs) => rs.has(fs));
        if (!any) return false;
      }
      return true;
    });

    list = [...list];
    if (sortKey === "intro_desc") {
      list.sort((a, b) => introTime(b.introduction_at) - introTime(a.introduction_at));
    } else if (sortKey === "intro_asc") {
      list.sort((a, b) => introTime(a.introduction_at) - introTime(b.introduction_at));
    } else {
      list.sort((a, b) =>
        pairSortKey(a).localeCompare(pairSortKey(b), undefined, {
          sensitivity: "base",
        }),
      );
    }
    return list;
  }, [rows, filterSearch, filterKind, filterPipeline, filterSectors, sortKey]);

  const ensureContacts = useCallback(async () => {
    if (contactOptions.length > 0 || contactsLoading) return;
    setContactsLoading(true);
    setContactsPickerError(null);
    try {
      const res = await fetch(
        `/api/workspace/contacts?page=1&pageSize=${WORKSPACE_CONTACTS_PAGE_SIZE_MAX}`,
      );
      const data = (await res.json()) as {
        rows?: WorkspaceContactPageRow[];
        error?: string;
      };
      if (!res.ok) {
        setContactsPickerError(
          data.error ?? "Could not load contacts for this form.",
        );
        return;
      }
      if (Array.isArray(data.rows)) {
        setContactOptions(
          data.rows
            .filter((r) => typeof r.id === "string" && r.id.length > 0)
            .map((r) => ({
              id: r.id,
              name: r.name?.trim() ? r.name : "Unnamed contact",
              contact_type: r.contact_type,
            })),
        );
      }
    } catch {
      setContactsPickerError("Network error while loading contacts.");
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
    setContactsPickerError(null);
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
      setToast(
        "Introduction removed. Linked suggestion is in Suggestions → Archived.",
      );
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setPendingUndo(null);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8">
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="shrink-0 rounded-xl border border-charcoal/[0.08] bg-cream-light/50 px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[12rem] flex-1">
                <label
                  className={WORKSPACE_FORM_LABEL_CLASS}
                  htmlFor="opp-filter-search"
                >
                  Search
                </label>
                <input
                  id="opp-filter-search"
                  type="search"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Names or notes…"
                />
              </div>
              <div className="w-full min-w-[9rem] sm:w-36">
                <label
                  className={WORKSPACE_FORM_LABEL_CLASS}
                  htmlFor="opp-filter-kind"
                >
                  Match kind
                </label>
                <select
                  id="opp-filter-kind"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  value={filterKind}
                  onChange={(e) =>
                    setFilterKind(e.target.value as "all" | MatchKind)
                  }
                >
                  <option value="all">All kinds</option>
                  <option value="founder_investor">
                    {KIND_LABEL.founder_investor}
                  </option>
                  <option value="founder_lender">
                    {KIND_LABEL.founder_lender}
                  </option>
                </select>
              </div>
              <div className="w-full min-w-[9rem] sm:w-36">
                <label
                  className={WORKSPACE_FORM_LABEL_CLASS}
                  htmlFor="opp-filter-pipe"
                >
                  Pipeline
                </label>
                <select
                  id="opp-filter-pipe"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  value={filterPipeline}
                  onChange={(e) =>
                    setFilterPipeline(e.target.value as PipelineFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="has">Has deals</option>
                  <option value="none">No deals yet</option>
                </select>
              </div>
              <div className="w-full min-w-[9rem] sm:w-40">
                <label
                  className={WORKSPACE_FORM_LABEL_CLASS}
                  htmlFor="opp-filter-sort"
                >
                  Sort
                </label>
                <select
                  id="opp-filter-sort"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  value={sortKey}
                  onChange={(e) =>
                    setSortKey(e.target.value as OpportunitySortKey)
                  }
                >
                  <option value="intro_desc">Intro date · Newest</option>
                  <option value="intro_asc">Intro date · Oldest</option>
                  <option value="pair_az">Pair name A–Z</option>
                </select>
              </div>
              <div className="w-full min-w-[10rem] sm:w-44">
                <span className={WORKSPACE_FORM_LABEL_CLASS}>Industry</span>
                <details className="relative">
                  <summary
                    className={`${WORKSPACE_FORM_INPUT_CLASS} flex cursor-pointer list-none items-center justify-between gap-2 text-xs [&::-webkit-details-marker]:hidden`}
                  >
                    <span>
                      {filterSectors.length === 0
                        ? "All sectors"
                        : `${filterSectors.length} selected`}
                    </span>
                  </summary>
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-lg border border-charcoal/12 bg-cream-light py-1 shadow-md sm:right-auto sm:w-56">
                    {uniqueSectors.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-charcoal-light/80">
                        No sectors on contacts yet.
                      </p>
                    ) : (
                      uniqueSectors.map((sec) => (
                        <label
                          key={sec}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-charcoal hover:bg-charcoal/5"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-charcoal/25"
                            checked={filterSectors.includes(sec)}
                            onChange={() => {
                              setFilterSectors((prev) =>
                                prev.includes(sec)
                                  ? prev.filter((x) => x !== sec)
                                  : [...prev, sec],
                              );
                            }}
                          />
                          <span className="min-w-0 truncate">{sec}</span>
                        </label>
                      ))
                    )}
                  </div>
                </details>
              </div>
              {hasActiveFilters ? (
                <div className="flex items-end pb-0.5 sm:pb-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-charcoal-light underline decoration-charcoal/30 underline-offset-2 hover:text-charcoal"
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-charcoal/[0.08] bg-cream-light/40">
            {filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-sm text-charcoal-light">
                  No opportunities match your filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-charcoal underline decoration-charcoal/30 underline-offset-2"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-charcoal/[0.06]">
                {filteredRows.map((o) => {
                  const whyFitMarkdownComponents = createWhyFitMarkdownComponents();
                  const introNotes = o.introduction_notes?.trim() ?? "";
                  const contextMd = o.context?.trim() ?? "";
                  const sectorChips = [...rowSectorSet(o)].sort((a, b) =>
                    a.localeCompare(b),
                  );
                  const introExpanded = expandedIntroNotes[o.id] ?? false;
                  const introLong =
                    introNotes.length > INTRO_NOTES_COLLAPSE_AFTER_CHARS;
                  return (
                    <li
                      key={o.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm font-medium text-charcoal">
                          {o.contact_a_name}{" "}
                          <span className="text-charcoal-light/70">↔</span>{" "}
                          {o.contact_b_name}
                        </p>
                        <ContactPairGeographyLine
                          contactAName={o.contact_a_name}
                          contactBName={o.contact_b_name}
                          contactAGeography={o.contact_a_geography}
                          contactBGeography={o.contact_b_geography}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-charcoal/10 bg-cream-light/90 px-2 py-0.5 text-[10px] font-medium text-charcoal/90">
                            {KIND_LABEL[o.kind]}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-charcoal/10 bg-cream-light/90 px-2 py-0.5 text-[10px] font-medium text-charcoal/90">
                            <Sparkles
                              className="size-2.5 shrink-0 text-charcoal/45"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            {o.transaction_count} on pipeline
                          </span>
                          <span className="inline-flex items-center rounded-full border border-charcoal/10 bg-cream-light/90 px-2 py-0.5 text-[10px] font-medium text-charcoal/90">
                            Introduced {formatIntroDateShort(o.introduction_at)}
                          </span>
                          {sectorChips.map((sec) => (
                            <span
                              key={`${o.id}:${sec}`}
                              className="inline-flex items-center rounded-full border border-charcoal/10 bg-charcoal/[0.05] px-2 py-0.5 text-[10px] font-medium text-charcoal-light"
                            >
                              {sec}
                            </span>
                          ))}
                        </div>

                        {introNotes || contextMd ? (
                          <div className="rounded-md border border-charcoal/[0.08] bg-muted/30 p-3 text-[13px] leading-relaxed text-charcoal-light/90">
                            {introNotes ? (
                              <div
                                className={
                                  contextMd
                                    ? "border-b border-charcoal/[0.06] pb-3"
                                    : ""
                                }
                              >
                                <p className="text-[11px] font-medium text-charcoal/80">
                                  Introduction notes
                                </p>
                                <div
                                  className={
                                    introExpanded || !introLong
                                      ? "mt-1.5 [&_.my-1:first-child]:mt-0"
                                      : "mt-1.5 line-clamp-3 [&_.my-1:first-child]:mt-0"
                                  }
                                >
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={opportunityMarkdownComponents}
                                  >
                                    {introNotes}
                                  </ReactMarkdown>
                                </div>
                                {introLong ? (
                                  <button
                                    type="button"
                                    className="mt-1 text-[11px] font-medium text-charcoal/70 underline decoration-charcoal/25 underline-offset-2 hover:text-charcoal"
                                    onClick={() =>
                                      setExpandedIntroNotes((prev) => ({
                                        ...prev,
                                        [o.id]: !introExpanded,
                                      }))
                                    }
                                  >
                                    {introExpanded ? "Show less" : "Show more"}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {contextMd ? (
                              <div className={introNotes ? "mt-3" : ""}>
                                <p className="text-[11px] font-medium text-charcoal/80">
                                  Why they fit
                                </p>
                                <div className="mt-1.5 [&_.my-1:first-child]:mt-0 [&_h2]:mt-0">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={whyFitMarkdownComponents}
                                  >
                                    {contextMd}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            ) : null}
                          </div>
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
                          disabled={pendingUndo !== null}
                          onClick={() => void onUndo(o.id)}
                          title="Remove this introduction and archive the Rex suggestion if there was one. Pipeline deals for this intro are removed too."
                          className="inline-flex items-center gap-1 rounded-lg border border-charcoal/12 bg-cream-light/60 px-2.5 py-1.5 text-[11px] font-medium text-charcoal-light transition-colors hover:border-red-400/40 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          Undo
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          {contactsPickerError ? (
            <p className="text-sm text-red-700/90" role="alert">
              {contactsPickerError}
            </p>
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
