"use client";

import {
  Handshake,
  Mic,
  Pencil,
  PieChart,
  Plus,
  Sparkles,
  Target,
  Upload,
  Users,
} from "lucide-react";
import type {
  DashboardMetrics,
  MatchStage,
  SectorBreakdownEntry,
} from "@/lib/data/dashboard-metrics.types";

type DashboardPanelProps = {
  metrics: DashboardMetrics;
  onAddContact?: () => void;
  onOpenQuickCapture?: () => void;
  onOpenSuggestions?: () => void;
};

function formatCount(value: number): string {
  return value.toLocaleString();
}

/**
 * Compact GBP formatter for dashboard tiles. Mirrors the look used in the
 * intro-match suggestions copy ("£5.2M", "£750K") so the dashboard stays
 * visually consistent with the rest of the product.
 */
function formatGbpCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "£0";
  if (value >= 1_000_000) {
    const m = Math.round(value / 100_000) / 10;
    return `£${m.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1_000) {
    const k = Math.round(value / 100) / 10;
    return `£${k.toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  }
  return `£${Math.round(value).toLocaleString()}`;
}

type MetricCardProps = {
  label: string;
  value: string;
  subline: string;
  icon: React.ReactNode;
};

function MetricCard({ label, value, subline, icon }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-charcoal/[0.08] bg-cream-light/60 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
          {label}
        </p>
        <span className="flex size-7 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
          {icon}
        </span>
      </div>
      <p className="font-serif text-4xl tracking-tight text-charcoal">
        {value}
      </p>
      <p className="text-xs text-charcoal-light/85">{subline}</p>
    </div>
  );
}

const STAGE_ORDER: MatchStage[] = ["introduced", "active", "closed"];

const STAGE_LABELS: Record<MatchStage, string> = {
  introduced: "Opportunities",
  active: "Active deals",
  closed: "Closed deals",
};

const STAGE_BAR_BG: Record<MatchStage, string> = {
  introduced: "bg-charcoal/25",
  active: "bg-charcoal/55",
  closed: "bg-charcoal/90",
};

const STAGE_DOT_BG: Record<MatchStage, string> = {
  introduced: "bg-charcoal/30",
  active: "bg-charcoal/60",
  closed: "bg-charcoal/95",
};

type StageBreakdownProps = {
  matchesByStage: Record<MatchStage, number>;
};

function StageBreakdown({ matchesByStage }: StageBreakdownProps) {
  const total = STAGE_ORDER.reduce((sum, s) => sum + matchesByStage[s], 0);

  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-cream-light/60 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
          Pipeline snapshot
        </p>
        <p className="text-[11px] text-charcoal-light/70">
          {formatCount(total)} total
        </p>
      </div>

      {total === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-charcoal/15 bg-cream-light/40 px-4 py-6 text-center">
          <p className="text-xs text-charcoal-light/80">
            No matches to show yet.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-charcoal/[0.06]">
            {STAGE_ORDER.map((stage) => {
              const count = matchesByStage[stage];
              if (count === 0) return null;
              const widthPct = (count / total) * 100;
              return (
                <div
                  key={stage}
                  className={`h-full ${STAGE_BAR_BG[stage]}`}
                  style={{ width: `${widthPct}%` }}
                  aria-label={`${STAGE_LABELS[stage]}: ${count}`}
                />
              );
            })}
          </div>

          <ul className="mt-4 grid grid-cols-3 gap-2">
            {STAGE_ORDER.map((stage) => {
              const count = matchesByStage[stage];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <li
                  key={stage}
                  className="flex items-center gap-2 rounded-lg border border-charcoal/[0.06] bg-cream-light/40 px-3 py-2"
                >
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${STAGE_DOT_BG[stage]}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
                      {STAGE_LABELS[stage]}
                    </p>
                    <p className="text-sm text-charcoal">
                      {formatCount(count)}
                      <span className="ml-1 text-xs text-charcoal-light/70">
                        {pct}%
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

const SECTOR_TOP_N = 6;

const SECTOR_BAR_OPACITIES = [0.9, 0.78, 0.65, 0.52, 0.4, 0.28] as const;

type SectorBreakdownProps = {
  contactsBySector: SectorBreakdownEntry[];
  sectorContactCount: number;
  sectorUnknownCount: number;
};

function SectorBreakdown({
  contactsBySector,
  sectorContactCount,
  sectorUnknownCount,
}: SectorBreakdownProps) {
  const topN = contactsBySector.slice(0, SECTOR_TOP_N);
  const rest = contactsBySector.slice(SECTOR_TOP_N);
  const restCount = rest.reduce((sum, e) => sum + e.count, 0);

  const rows: Array<{
    key: string;
    label: string;
    count: number;
    muted?: boolean;
  }> = topN.map((entry) => ({
    key: entry.sector,
    label: entry.sector,
    count: entry.count,
  }));

  if (restCount > 0) {
    rows.push({
      key: "__other__",
      label: `Other (${rest.length})`,
      count: restCount,
      muted: true,
    });
  }

  if (sectorUnknownCount > 0) {
    rows.push({
      key: "__unknown__",
      label: "Unspecified",
      count: sectorUnknownCount,
      muted: true,
    });
  }

  const maxCount = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);

  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-cream-light/60 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
            <PieChart className="size-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
            Contacts by sector
          </p>
        </div>
        <p className="text-[11px] text-charcoal-light/70">
          {formatCount(sectorContactCount)} contact
          {sectorContactCount === 1 ? "" : "s"}
        </p>
      </div>

      {sectorContactCount === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-charcoal/15 bg-cream-light/40 px-4 py-6 text-center">
          <p className="text-xs text-charcoal-light/80">
            No contacts to break down yet.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.map((row, index) => {
            const pct =
              sectorContactCount > 0
                ? Math.round((row.count / sectorContactCount) * 100)
                : 0;
            const widthPct =
              maxCount > 0 ? Math.max(2, (row.count / maxCount) * 100) : 0;
            const opacity = row.muted
              ? 0.22
              : (SECTOR_BAR_OPACITIES[index] ?? 0.28);
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={[
                      "truncate text-sm",
                      row.muted ? "text-charcoal-light/75" : "text-charcoal",
                    ].join(" ")}
                    title={row.label}
                  >
                    {row.label}
                  </p>
                  <p className="shrink-0 text-xs text-charcoal-light/85">
                    <span className="text-charcoal">
                      {formatCount(row.count)}
                    </span>
                    <span className="ml-1 text-charcoal-light/70">{pct}%</span>
                  </p>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-charcoal/[0.06]"
                  aria-label={`${row.label}: ${row.count} contact${row.count === 1 ? "" : "s"} (${pct}%)`}
                >
                  <div
                    className="h-full rounded-full bg-charcoal"
                    style={{ width: `${widthPct}%`, opacity }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DashboardPanel({
  metrics,
  onAddContact,
  onOpenQuickCapture,
  onOpenSuggestions,
}: DashboardPanelProps) {
  const {
    contactCount,
    contactsNew30d,
    openMatchCount,
    totalPipelineGbp,
    matchesByStage,
    contactsBySector,
    sectorContactCount,
    sectorUnknownCount,
    activeMatchesCount,
    pendingSuggestionsCount,
  } = metrics;

  const contactsSubline =
    contactsNew30d > 0
      ? `+${formatCount(contactsNew30d)} in last 30 days`
      : "No new contacts in last 30 days";

  const pipelineSubline =
    openMatchCount > 0
      ? `Across ${formatCount(openMatchCount)} open match${openMatchCount === 1 ? "" : "es"}`
      : "No live matches on the canvas";

  const activeSubline =
    activeMatchesCount > 0
      ? `${formatCount(activeMatchesCount)} pair${activeMatchesCount === 1 ? "" : "s"} in live conversation`
      : "No pairs in active conversation";

  const suggestionsSubline =
    pendingSuggestionsCount > 0
      ? "Waiting on your intro"
      : "Inbox is clear — run Generate matches";

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <h2 className="font-serif text-xl tracking-tight text-charcoal">
          Dashboard
        </h2>
        <p className="mt-1 text-xs text-charcoal-light/80">
          A quick read on contacts, matches on the canvas, and suggestions
          waiting on you.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Contacts"
          value={formatCount(contactCount)}
          subline={contactsSubline}
          icon={<Users className="size-3.5" strokeWidth={1.75} aria-hidden />}
        />
        <MetricCard
          label="Total pipeline"
          value={formatGbpCompact(totalPipelineGbp)}
          subline={pipelineSubline}
          icon={
            <Handshake className="size-3.5" strokeWidth={1.75} aria-hidden />
          }
        />
        <MetricCard
          label="Active matches"
          value={formatCount(activeMatchesCount)}
          subline={activeSubline}
          icon={<Target className="size-3.5" strokeWidth={1.75} aria-hidden />}
        />
        <MetricCard
          label="Pending suggestions"
          value={formatCount(pendingSuggestionsCount)}
          subline={suggestionsSubline}
          icon={
            <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StageBreakdown matchesByStage={matchesByStage} />
        <SectorBreakdown
          contactsBySector={contactsBySector}
          sectorContactCount={sectorContactCount}
          sectorUnknownCount={sectorUnknownCount}
        />
      </div>

      <div className="mt-8">
        <button
          type="button"
          onClick={onOpenQuickCapture}
          className="group flex w-full flex-col gap-4 rounded-2xl border border-charcoal/[0.1] bg-charcoal p-6 text-left text-cream shadow-md transition-all hover:shadow-lg sm:p-7"
          aria-label="Quick Capture — add a contact from a note, voice, or photo"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-cream/15 text-cream">
              <Plus className="size-5" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-cream/70">
                Main action
              </p>
              <p className="font-serif text-2xl tracking-tight text-cream">
                Quick Capture
              </p>
            </div>
          </div>
          <p className="text-sm text-cream/85">
            Just met someone? Drop a note, dictate a voice memo, or snap a photo
            of their card — Rex extracts the contact and proposes intro matches
            to run with.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1.5 text-xs font-medium text-cream/90">
              <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden />
              Text note
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1.5 text-xs font-medium text-cream/90">
              <Mic className="size-3.5" strokeWidth={1.75} aria-hidden />
              Voice memo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1.5 text-xs font-medium text-cream/90">
              <Upload className="size-3.5" strokeWidth={1.75} aria-hidden />
              Card or PDF
            </span>
          </div>
        </button>

        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-charcoal-light/80">
          <button
            type="button"
            onClick={onAddContact}
            className="rounded-md text-charcoal-light underline-offset-2 transition-colors hover:text-charcoal hover:underline"
          >
            Add a contact manually
          </button>
          <button
            type="button"
            onClick={onOpenSuggestions}
            className="group inline-flex items-center gap-2 rounded-md text-charcoal-light transition-colors hover:text-charcoal"
            aria-label="Open Rex suggestions"
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
            <span>
              <span className="font-semibold text-charcoal">
                {formatCount(pendingSuggestionsCount)}
              </span>{" "}
              unreviewed suggestion
              {pendingSuggestionsCount === 1 ? "" : "s"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
