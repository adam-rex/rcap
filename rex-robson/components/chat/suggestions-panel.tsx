"use client";

import { RefreshCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  matchFitOutOfFive,
  SUGGESTION_MATCH_FIT_TIERS,
  suggestionTierDefinition,
  suggestionTierMetaForRaw,
} from "@/lib/match/suggestion-score";
import { rexEmptySuggestions } from "@/lib/rex/voice";
import type { WorkspaceSuggestionRow } from "@/lib/data/workspace-lists";
import type { MatchKind } from "@/lib/data/workspace-matches-page.types";
import { stripWorkspaceMarkdownDecorators } from "@/lib/format/workspace-display-text";

const LAST_RUN_STORAGE_KEY = "rex:suggestions:lastRun";
const THROTTLE_MS = 60_000;

type GenerateMatchesResult = {
  created: number;
  skippedDuplicates: number;
  skippedBelowThreshold: number;
  runMs: number;
};

type SuggestionsPanelProps = {
  rows: WorkspaceSuggestionRow[];
  isEmpty: boolean;
};

const KIND_LABEL: Record<MatchKind, string> = {
  founder_investor: "Founder · Investor",
  founder_lender: "Founder · Lender",
};

function muted(line: string | null | undefined) {
  if (line == null || line === "") return null;
  const cleaned = stripWorkspaceMarkdownDecorators(line);
  if (cleaned === "") return null;
  return (
    <p className="mt-0.5 whitespace-pre-line line-clamp-6 text-xs text-charcoal-light/85">
      {cleaned}
    </p>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function resultSummary(r: GenerateMatchesResult): string {
  const parts: string[] = [];
  parts.push(
    `Added ${r.created} ${r.created === 1 ? "suggestion" : "suggestions"}`,
  );
  const extras: string[] = [];
  if (r.skippedDuplicates > 0) extras.push(`${r.skippedDuplicates} duplicates`);
  if (r.skippedBelowThreshold > 0)
    extras.push(`${r.skippedBelowThreshold} below threshold`);
  if (extras.length > 0) parts.push(`(${extras.join(", ")} skipped)`);
  return parts.join(" ");
}

type SuggestionsTab = "live" | "archived";

export function SuggestionsPanel({ rows, isEmpty }: SuggestionsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<GenerateMatchesResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<SuggestionsTab>("live");
  const [selectedScores, setSelectedScores] = useState<Set<number>>(new Set());

  const toggleScore = useCallback((n: number) => {
    setSelectedScores((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  const clearScoreFilter = useCallback(() => {
    setSelectedScores(new Set());
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAST_RUN_STORAGE_KEY);
      if (raw) {
        const n = Number.parseInt(raw, 10);
        if (Number.isFinite(n)) setLastRunAt(n);
      }
    } catch {
      // localStorage unavailable; skip persistence
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const throttleRemaining = useMemo(() => {
    if (lastRunAt == null) return 0;
    return Math.max(0, THROTTLE_MS - (Date.now() - lastRunAt));
  }, [lastRunAt]);

  const runGenerate = useCallback(() => {
    if (isPending) return;
    if (throttleRemaining > 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/workspace/suggestions/generate-matches", {
          method: "POST",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `generate_matches_failed (${res.status})`);
        }
        const data = (await res.json()) as GenerateMatchesResult;
        const now = Date.now();
        setLastRunAt(now);
        setLastResult(data);
        try {
          window.localStorage.setItem(LAST_RUN_STORAGE_KEY, String(now));
        } catch {
          // ignore storage errors
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate matches");
      }
    });
  }, [isPending, router, throttleRemaining]);

  const runAction = useCallback(
    async (id: string, action: "accept" | "dismiss") => {
      if (pendingActionIds.has(id)) return;
      setError(null);
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const res = await fetch(
          `/api/workspace/suggestions/${encodeURIComponent(id)}/${action}`,
          { method: "POST" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `${action}_failed_${res.status}`);
        }
        if (action === "accept") {
          setToast("Introduction recorded — see Opportunities.");
        } else {
          setToast("Suggestion dismissed.");
        }
        router.refresh();
      } catch (e) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setError(
          e instanceof Error ? e.message : "Failed to update suggestion",
        );
      } finally {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [pendingActionIds, router],
  );

  const liveRows = useMemo(
    () =>
      rows.filter((r) => r.status === "pending" && !hiddenIds.has(r.id)),
    [rows, hiddenIds],
  );
  const archivedRows = useMemo(
    () => rows.filter((r) => r.status === "dismissed"),
    [rows],
  );
  const tabRows = activeTab === "live" ? liveRows : archivedRows;
  const filteredRows = useMemo(() => {
    if (selectedScores.size === 0) return tabRows;
    return tabRows.filter((r) => {
      if (typeof r.score !== "number") return false;
      return selectedScores.has(matchFitOutOfFive(r.score));
    });
  }, [tabRows, selectedScores]);
  const scoreCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of tabRows) {
      if (typeof r.score !== "number") continue;
      const bucket = matchFitOutOfFive(r.score);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    return counts;
  }, [tabRows]);
  const visibleRows = filteredRows;
  const liveEmpty = isEmpty || liveRows.length === 0;
  const archivedEmpty = archivedRows.length === 0;
  const tabEmpty = activeTab === "live" ? liveEmpty : archivedEmpty;
  const filterActive = selectedScores.size > 0;
  const filteredEmpty = filterActive && filteredRows.length === 0;
  const visiblyEmpty = tabEmpty || filteredEmpty;

  const buttonDisabled = isPending || throttleRemaining > 0;
  const buttonLabel = isPending
    ? "Generating…"
    : throttleRemaining > 0
      ? `Wait ${Math.ceil(throttleRemaining / 1000)}s`
      : liveEmpty
        ? "Generate matches"
        : "Refresh suggestions";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-8">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl tracking-tight text-charcoal">
            Suggestions
          </h2>
          <p className="mt-1 text-xs text-charcoal-light/80">
            {activeTab === "live"
              ? liveEmpty
                ? "No profile matches pending — generate fresh founder <> investor and founder <> lender pairs."
                : filterActive
                  ? `${filteredRows.length} of ${liveRows.length} row${liveRows.length === 1 ? "" : "s"} match score filter`
                  : `${liveRows.length} row${liveRows.length === 1 ? "" : "s"} from your workspace`
              : archivedEmpty
                ? "No archived suggestions yet — dismissed suggestions and undone introductions show up here."
                : filterActive
                  ? `${filteredRows.length} of ${archivedRows.length} archived match score filter`
                  : `${archivedRows.length} archived suggestion${archivedRows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={runGenerate}
            disabled={buttonDisabled}
            className="inline-flex items-center gap-2 rounded-lg border border-charcoal/[0.08] bg-cream-light/80 px-3 py-1.5 text-xs font-medium text-charcoal shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors hover:bg-cream-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={"size-3.5 " + (isPending ? "animate-spin" : "")}
              strokeWidth={1.75}
              aria-hidden
            />
            {buttonLabel}
          </button>
          {lastRunAt != null ? (
            <p className="text-[11px] text-charcoal-light/70">
              Last run {formatRelative(lastRunAt)}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="mb-4 inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-charcoal/[0.08] bg-cream-light/60 p-1 text-xs"
        role="tablist"
        aria-label="Suggestion views"
      >
        {(
          [
            { id: "live", label: "Live", count: liveRows.length },
            { id: "archived", label: "Archived", count: archivedRows.length },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors " +
                (isActive
                  ? "bg-charcoal text-cream"
                  : "text-charcoal-light hover:text-charcoal")
              }
            >
              <span>{tab.label}</span>
              <span
                className={
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
                  (isActive
                    ? "bg-cream/20 text-cream"
                    : "bg-charcoal/[0.08] text-charcoal-light")
                }
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/70">
          Match fit
        </span>
        <div
          className="inline-flex items-center gap-1 rounded-lg border border-charcoal/[0.08] bg-cream-light/60 p-1"
          role="group"
          aria-label="Filter by match fit tier"
        >
          {([1, 2, 3, 4, 5] as const).map((n) => {
            const isOn = selectedScores.has(n);
            const count = scoreCounts[n] ?? 0;
            const def = suggestionTierDefinition(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleScore(n)}
                aria-pressed={isOn}
                title={`${def.tier}/5 — ${def.label}. ${def.detail}`}
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors " +
                  (isOn
                    ? "bg-charcoal text-cream"
                    : "text-charcoal-light hover:text-charcoal")
                }
              >
                <span>{n}/5</span>
                <span
                  className={
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
                    (isOn
                      ? "bg-cream/20 text-cream"
                      : "bg-charcoal/[0.08] text-charcoal-light")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {filterActive ? (
          <button
            type="button"
            onClick={clearScoreFilter}
            className="text-[11px] font-medium text-charcoal-light underline-offset-2 hover:text-charcoal hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <details className="mb-4 rounded-lg border border-charcoal/[0.08] bg-cream-light/50 px-3 py-2 text-xs text-charcoal-light">
        <summary className="cursor-pointer list-none font-medium text-charcoal outline-none marker:content-none [&::-webkit-details-marker]:hidden">
          How match fit is calculated
        </summary>
        <p className="mt-2 leading-relaxed text-charcoal-light/90">
          Rex compares each founder to each investor or lender using your contact
          fields: overlapping{" "}
          <span className="text-charcoal">sectors</span> and{" "}
          <span className="text-charcoal">deal types</span>, whether{" "}
          <span className="text-charcoal">cheque / deal-size</span> ranges
          intersect, shared{" "}
          <span className="text-charcoal">geography</span>, whether at least one
          side has a warm <span className="text-charcoal">relationship score</span>{" "}
          (7+), and whether both sides look{" "}
          <span className="text-charcoal">stale</span> (last contacted over a year
          ago — that reduces fit). The raw total is bucketed into five tiers:
        </p>
        <ul className="mt-3 space-y-2.5 border-t border-charcoal/[0.06] pt-3">
          {SUGGESTION_MATCH_FIT_TIERS.map((d) => (
            <li key={d.tier} className="leading-relaxed">
              <span className="font-semibold text-charcoal">
                {d.tier}/5 — {d.label}
              </span>
              <span className="text-charcoal-light"> — {d.summary}</span>
              <span className="mt-0.5 block pl-0 text-[11px] text-charcoal-light/85">
                {d.detail}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {lastResult ? (
        <div className="mb-3 rounded-lg border border-charcoal/[0.08] bg-cream-light/60 px-3 py-2 text-xs text-charcoal-light">
          {resultSummary(lastResult)}
        </div>
      ) : null}
      {toast ? (
        <div
          className="mb-3 rounded-lg border border-charcoal/[0.12] bg-charcoal/[0.04] px-3 py-2 text-xs text-charcoal"
          role="status"
        >
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {visiblyEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-start justify-start rounded-xl border border-dashed border-charcoal/15 bg-cream-light/40 p-6">
          <span className="flex size-9 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          {filteredEmpty && !tabEmpty ? (
            <>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal">
                No suggestions match the selected tiers.
              </p>
              <p className="mt-3 max-w-md text-sm text-charcoal-light">
                Try a different score or{" "}
                <button
                  type="button"
                  onClick={clearScoreFilter}
                  className="font-medium text-charcoal underline underline-offset-2"
                >
                  clear the filter
                </button>
                .
              </p>
            </>
          ) : activeTab === "live" ? (
            <>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal">
                {rexEmptySuggestions}
              </p>
              <p className="mt-3 max-w-md text-sm text-charcoal-light">
                Hit{" "}
                <span className="font-medium text-charcoal">
                  Generate matches
                </span>{" "}
                to scan your contacts for founder{" "}
                <span aria-hidden>&lt;&gt;</span> investor and founder{" "}
                <span aria-hidden>&lt;&gt;</span> lender pairs with overlapping
                sector, deal type, cheque size, or geography.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal">
                No archived suggestions yet.
              </p>
              <p className="mt-3 max-w-md text-sm text-charcoal-light">
                Suggestions you dismiss from the{" "}
                <span className="font-medium text-charcoal">Live</span> tab, or
                undo from the{" "}
                <span className="font-medium text-charcoal">Opportunities</span>{" "}
                tab, appear here.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-charcoal/[0.08] bg-cream-light/40">
          <ul className="divide-y divide-charcoal/[0.06]">
            {visibleRows.map((s) => {
              const acting = pendingActionIds.has(s.id);
              const hasPair =
                Boolean(s.contact_a_name) && Boolean(s.contact_b_name);
              const headline = hasPair
                ? `${s.contact_a_name} → ${s.contact_b_name}`
                : (s.title?.trim() || "Suggestion");
              const subtitle = hasPair && s.title?.trim() ? s.title.trim() : null;
              const subtitleClean = subtitle
                ? stripWorkspaceMarkdownDecorators(subtitle)
                : "";
              const tierMeta =
                typeof s.score === "number"
                  ? suggestionTierMetaForRaw(s.score)
                  : null;
              return (
                <li
                  key={s.id}
                  className={
                    "flex items-start gap-3 px-4 py-3 " +
                    (acting ? "opacity-60" : "")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-charcoal">
                      {headline}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {s.kind ? (
                        <span className="inline-flex items-center rounded-full border border-charcoal/15 bg-charcoal/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-charcoal">
                          {KIND_LABEL[s.kind]}
                        </span>
                      ) : null}
                      {tierMeta ? (
                        <span
                          className="inline-flex max-w-full items-center rounded-full border border-charcoal/10 bg-cream px-2 py-0.5 text-[10px] font-medium tracking-wide text-charcoal-light"
                          title={tierMeta.detail}
                        >
                          <span className="text-charcoal">
                            {tierMeta.tier}/5
                          </span>
                          <span className="ml-1 normal-case opacity-90">
                            {tierMeta.label}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {subtitleClean ? (
                      <p className="mt-1 text-xs text-charcoal-light/80">
                        {subtitleClean}
                      </p>
                    ) : null}
                    {muted(s.body)}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {activeTab === "live" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => runAction(s.id, "accept")}
                          disabled={acting}
                          aria-label="Made introduction"
                          className="rounded-lg border border-charcoal/[0.08] bg-cream-light/60 px-2.5 py-1.5 text-[11px] font-medium text-charcoal transition-colors hover:bg-charcoal hover:text-cream disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Made introduction
                        </button>
                        <button
                          type="button"
                          onClick={() => runAction(s.id, "dismiss")}
                          disabled={acting}
                          aria-label="Dismiss suggestion"
                          title="Dismiss"
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-charcoal/[0.08] bg-cream-light/60 text-charcoal-light transition-colors hover:bg-red-500 hover:text-white hover:border-red-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X className="size-4" strokeWidth={2} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-charcoal/10 bg-charcoal/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-charcoal-light">
                        Dismissed
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
