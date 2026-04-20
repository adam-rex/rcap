"use client";

import { Briefcase, Plus, PoundSterling, Users } from "lucide-react";
import type { DashboardMetrics } from "@/lib/data/dashboard-metrics.types";

type DashboardPanelProps = {
  metrics: DashboardMetrics;
  onAddContact?: () => void;
};

function formatGbp(value: number): string {
  if (!Number.isFinite(value)) return "£0";
  if (value >= 1_000_000) return `£${(Math.round(value / 100_000) / 10).toLocaleString()}M`;
  if (value >= 1_000) return `£${(Math.round(value / 100) / 10).toLocaleString()}K`;
  return `£${Math.round(value).toLocaleString()}`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
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
      <p className="font-serif text-4xl tracking-tight text-charcoal">{value}</p>
      <p className="text-xs text-charcoal-light/85">{subline}</p>
    </div>
  );
}

export function DashboardPanel({ metrics, onAddContact }: DashboardPanelProps) {
  const {
    contactCount,
    contactsNew30d,
    openDealCount,
    openPipelineValue,
    avgDealSize,
  } = metrics;

  const contactsSubline =
    contactsNew30d > 0
      ? `+${formatCount(contactsNew30d)} in last 30 days`
      : "No new contacts in last 30 days";

  const pipelineSubline =
    avgDealSize != null
      ? `Avg ${formatGbp(avgDealSize)} across ${formatCount(openDealCount)} open deal${openDealCount === 1 ? "" : "s"}`
      : "No open deal sizes recorded";

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <h2 className="font-serif text-xl tracking-tight text-charcoal">
          Dashboard
        </h2>
        <p className="mt-1 text-xs text-charcoal-light/80">
          A quick read on contacts, open deals, and pipeline value.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Contacts"
          value={formatCount(contactCount)}
          subline={contactsSubline}
          icon={<Users className="size-3.5" strokeWidth={1.75} aria-hidden />}
        />
        <MetricCard
          label="Potential Deals"
          value={formatCount(openDealCount)}
          subline="Open pipeline (excludes passed and closed)"
          icon={
            <Briefcase className="size-3.5" strokeWidth={1.75} aria-hidden />
          }
        />
        <MetricCard
          label="Pipeline Value"
          value={formatGbp(openPipelineValue)}
          subline={pipelineSubline}
          icon={
            <PoundSterling
              className="size-3.5"
              strokeWidth={1.75}
              aria-hidden
            />
          }
        />
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onAddContact}
          className="inline-flex items-center gap-2 rounded-lg bg-charcoal px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-cream transition-colors hover:bg-charcoal/90"
        >
          <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          Add contact
        </button>
      </div>
    </div>
  );
}
