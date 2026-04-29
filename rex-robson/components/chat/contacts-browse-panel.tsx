"use client";

import { Plus, Tag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { WORKSPACE_CONTACT_TYPES } from "@/lib/constants/contact-types";
import {
  WORKSPACE_SECTOR_LABEL,
  WORKSPACE_SECTOR_SLUGS,
  formatSectorsQuery,
  parseSectorsQuery,
  type WorkspaceSectorSlug,
} from "@/lib/constants/sectors";
import {
  WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT,
  type WorkspaceContactPageRow,
} from "@/lib/data/workspace-contacts.types";
import { ContactUpsertDialog } from "./contact-upsert-dialog";
import { WorkspaceBrowsePagination } from "./workspace-browse-pagination";
import { WORKSPACE_BROWSE_ROW_BUTTON_CLASS } from "./workspace-create-dialog";

function muted(line: string | null | undefined) {
  if (line == null || line === "") return null;
  return (
    <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/85">
      {line}
    </p>
  );
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const RECENCY_FULL_WEEKS = 24 * 0.2;
const RECENCY_ZERO_WEEKS = 24;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recencyStrength(lastContactDate: string | null) {
  if (!lastContactDate) return 0;
  const ts = Date.parse(lastContactDate);
  if (!Number.isFinite(ts)) return 0;
  const elapsedWeeks = Math.max(0, (Date.now() - ts) / MS_PER_WEEK);
  if (elapsedWeeks <= RECENCY_FULL_WEEKS) return 1;
  if (elapsedWeeks >= RECENCY_ZERO_WEEKS) return 0;
  return (
    1 -
    (elapsedWeeks - RECENCY_FULL_WEEKS) /
      (RECENCY_ZERO_WEEKS - RECENCY_FULL_WEEKS)
  );
}

function recencyLabel(lastContactDate: string | null) {
  if (!lastContactDate) return "No contact";
  const ts = Date.parse(lastContactDate);
  if (!Number.isFinite(ts)) return "No contact";
  const elapsedMs = Math.max(0, Date.now() - ts);
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays < 1) return "Today";
  if (elapsedDays < 7) return `${Math.floor(elapsedDays)}d ago`;
  if (elapsedDays < 30) return `${Math.floor(elapsedDays / 7)}w ago`;
  return `${Math.floor(elapsedDays / 30)}mo ago`;
}

function parseContactTypeFromUrl(raw: string | null): string {
  const t = (raw ?? "").trim();
  return (WORKSPACE_CONTACT_TYPES as readonly string[]).includes(t) ? t : "";
}

type ApiOk = { rows: WorkspaceContactPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

type ContactsBrowsePanelProps = {
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
};

function ContactsBrowsePanelInner({
  autoOpenCreate = false,
  onAutoOpenCreateHandled,
}: ContactsBrowsePanelProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageSize = WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WorkspaceContactPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [typeFiltersOpen, setTypeFiltersOpen] = useState(false);
  const [industryFiltersOpen, setIndustryFiltersOpen] = useState(false);
  const [activeContactType, setActiveContactType] = useState("");
  const [activeSectors, setActiveSectors] = useState<Set<WorkspaceSectorSlug>>(
    () => new Set(),
  );

  useLayoutEffect(() => {
    setActiveContactType(parseContactTypeFromUrl(searchParams.get("contactType")));
    setActiveSectors(new Set(parseSectorsQuery(searchParams.get("sectors"))));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search.slice(1) : "",
    );
    params.set("nav", "contacts");
    if (activeContactType) params.set("contactType", activeContactType);
    else params.delete("contactType");
    const sq = formatSectorsQuery(activeSectors);
    if (sq) params.set("sectors", sq);
    else params.delete("sectors");
    const nextQs = params.toString();
    const curQs =
      typeof window !== "undefined" ? window.location.search.slice(1) : "";
    if (nextQs !== curQs) {
      const href = nextQs.length > 0 ? `${pathname}?${nextQs}` : pathname;
      router.replace(href, { scroll: false });
    }
  }, [activeContactType, activeSectors, pathname, router]);

  const sectorsKey = useMemo(
    () => formatSectorsQuery(activeSectors),
    [activeSectors],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeContactType, sectorsKey]);

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
    if (activeContactType !== "") {
      params.set("contactType", activeContactType);
    }
    if (sectorsKey !== "") {
      params.set("sectors", sectorsKey);
    }
    try {
      const res = await fetch(`/api/workspace/contacts?${params.toString()}`);
      const data = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load contacts.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading contacts.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, pageSize, activeContactType, sectorsKey]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const hasFilters = activeContactType !== "" || activeSectors.size > 0;

  const filterSummary = useMemo(() => {
    const bits: string[] = [];
    if (activeContactType) bits.push(activeContactType);
    if (activeSectors.size > 0) {
      if (activeSectors.size === 1) {
        const only = [...activeSectors][0];
        bits.push(WORKSPACE_SECTOR_LABEL[only]);
      } else {
        bits.push(`${activeSectors.size} industries`);
      }
    }
    return bits.length > 0 ? ` · ${bits.join(" · ")}` : "";
  }, [activeContactType, activeSectors]);

  useEffect(() => {
    if (page !== safePage && safePage >= 1) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const openCreate = useCallback(() => {
    setFormOpen(true);
  }, []);

  useEffect(() => {
    if (autoOpenCreate) {
      openCreate();
      onAutoOpenCreateHandled?.();
    }
  }, [autoOpenCreate, openCreate, onAutoOpenCreateHandled]);

  const toggleSector = (slug: WorkspaceSectorSlug) => {
    setActiveSectors((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Contacts
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No matches for that search."
                    : "No contacts yet."
                  : `Showing ${from}–${to} of ${total}${hasFilters ? ` matching${filterSummary}` : ""}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            Add contact
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search contacts</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search by name, company, role, notes…"
            autoComplete="off"
            className="w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-light/50 outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypeFiltersOpen((v) => !v)}
            className="rounded-lg border border-charcoal/15 bg-cream px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-cream-light"
          >
            {typeFiltersOpen ? "Hide type filter" : "Filter by type"}
          </button>
          <button
            type="button"
            onClick={() => setIndustryFiltersOpen((v) => !v)}
            className="rounded-lg border border-charcoal/15 bg-cream px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-cream-light"
          >
            {industryFiltersOpen ? "Hide industry filter" : "Filter by industry"}
          </button>
          {activeContactType ? (
            <button
              type="button"
              onClick={() => setActiveContactType("")}
              className="rounded-lg border border-charcoal/15 bg-cream-light px-3 py-1.5 text-xs text-charcoal-light"
            >
              Clear type: {activeContactType}
            </button>
          ) : null}
          {activeSectors.size > 0 ? (
            <button
              type="button"
              onClick={() => setActiveSectors(new Set())}
              className="rounded-lg border border-charcoal/15 bg-cream-light px-3 py-1.5 text-xs text-charcoal-light"
            >
              Clear industries — {activeSectors.size} selected
            </button>
          ) : null}
        </div>
        {typeFiltersOpen ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Contact type">
            <button
              type="button"
              onClick={() => setActiveContactType("")}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeContactType === ""
                  ? "border-charcoal bg-charcoal text-cream"
                  : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
              }`}
            >
              All types
            </button>
            {WORKSPACE_CONTACT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveContactType(type)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  activeContactType === type
                    ? "border-charcoal bg-charcoal text-cream"
                    : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        ) : null}
        {industryFiltersOpen ? (
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Industry sectors"
          >
            <button
              type="button"
              onClick={() => setActiveSectors(new Set())}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeSectors.size === 0
                  ? "border-charcoal bg-charcoal text-cream"
                  : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
              }`}
            >
              All industries
            </button>
            {WORKSPACE_SECTOR_SLUGS.map((slug) => {
              const on = activeSectors.has(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleSector(slug)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    on
                      ? "border-charcoal bg-charcoal text-cream"
                      : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
                  }`}
                >
                  {WORKSPACE_SECTOR_LABEL[slug]}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 shrink-0 text-sm text-red-700/90" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream-light/40 p-2">
        <ul className="divide-y divide-charcoal/[0.06]">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <li key={i} className="animate-pulse px-4 py-3">
                  <div className="h-4 w-40 rounded bg-charcoal/10" />
                  <div className="mt-2 h-3 w-64 rounded bg-charcoal/5" />
                </li>
              ))
            : rows.map((c) => {
                const sub = [c.contact_type, c.sector, c.geography]
                  .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                  .join(" · ");
                const owner =
                  c.internal_owner?.trim().length
                    ? c.internal_owner.trim()
                    : null;
                const strength = recencyStrength(c.last_contact_date);
                const activeDots = strength <= 0 ? 0 : Math.ceil(strength * 5);
                const strengthPct = Math.round(strength * 100);
                return (
                  <li key={c.id} className="py-1.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className={`${WORKSPACE_BROWSE_ROW_BUTTON_CLASS} rounded-xl border border-charcoal/[0.07] bg-cream px-3 py-3 shadow-[0_1px_0_rgba(10,10,10,0.02)] transition hover:border-charcoal/[0.12] hover:bg-cream-light/40`}
                      aria-label={`View ${c.name}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-charcoal">
                                {c.name}
                              </p>
                              <span
                                className={
                                  owner
                                    ? "inline-flex shrink-0 items-center gap-1 rounded-md border border-charcoal/12 bg-white px-2 py-0.5 text-[11px] font-medium text-charcoal shadow-[0_1px_0_rgba(10,10,10,0.04)]"
                                    : "inline-flex shrink-0 items-center gap-1 rounded-md border border-charcoal/15 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-charcoal-light"
                                }
                                title="Rex team (internal)"
                              >
                                <Tag
                                  className={
                                    owner
                                      ? "size-3 shrink-0 text-charcoal/65"
                                      : "size-3 shrink-0 text-charcoal-light/90"
                                  }
                                  strokeWidth={1.75}
                                  aria-hidden
                                />
                                {owner ?? "Not set"}
                              </span>
                            </div>
                            {muted(sub || null)}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pl-12 sm:ml-2 sm:justify-end sm:pl-0">
                          <div
                            className="flex items-center gap-1"
                            aria-label={`Recency strength ${strengthPct}%`}
                          >
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={`block size-1.5 rounded-full ${
                                  i < activeDots
                                    ? "bg-charcoal"
                                    : "bg-charcoal/20"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-charcoal-light/75">
                            {recencyLabel(c.last_contact_date)}
                          </span>
                          {c.organisation_type ? (
                            <span className="rounded-full border border-charcoal/10 bg-cream-light px-2 py-0.5 text-xs text-charcoal-light">
                              {c.organisation_type}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
        </ul>
      </div>

      <WorkspaceBrowsePagination
        ariaLabel="Contacts pagination"
        safePage={safePage}
        totalPages={totalPages}
        loading={loading}
        onPageChange={setPage}
      />

      <ContactUpsertDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        mode="create"
        editingContact={null}
        onSaved={() => setReloadTick((n) => n + 1)}
        onAfterCreate={() => setPage(1)}
      />
    </div>
  );
}

export function ContactsBrowsePanel(props: ContactsBrowsePanelProps = {}) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 sm:px-8">
          <p className="text-sm text-charcoal-light">Loading contacts…</p>
        </div>
      }
    >
      <ContactsBrowsePanelInner {...props} />
    </Suspense>
  );
}
