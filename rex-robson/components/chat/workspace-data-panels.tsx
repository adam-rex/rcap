"use client";

import type { ReactNode } from "react";
import type {
  WorkspaceContactRow,
  WorkspaceDealRow,
  WorkspaceOrganisationRow,
  WorkspaceSuggestionRow,
} from "@/lib/data/workspace-lists";

function PanelChrome({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-8">
      <div className="mb-4 shrink-0">
        <h2 className="font-serif text-xl tracking-tight text-charcoal">
          {title}
        </h2>
        <p className="mt-1 text-xs text-charcoal-light/80">
          {count} row{count === 1 ? "" : "s"} from your workspace
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-charcoal/[0.08] bg-cream-light/40">
        <ul className="divide-y divide-charcoal/[0.06]">{children}</ul>
      </div>
    </div>
  );
}

function muted(line: string | null | undefined) {
  if (line == null || line === "") return null;
  return (
    <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/85">
      {line}
    </p>
  );
}

export function ContactsDataPanel({ rows }: { rows: WorkspaceContactRow[] }) {
  return (
    <PanelChrome title="Contacts" count={rows.length}>
      {rows.map((c) => {
        const org = c.organisations;
        const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
        const sub = [c.role, orgName, c.geography].filter(Boolean).join(" · ");
        return (
          <li key={c.id} className="px-4 py-3">
            <p className="text-sm font-medium text-charcoal">{c.name}</p>
            {muted(sub || null)}
          </li>
        );
      })}
    </PanelChrome>
  );
}

export function OrganisationsDataPanel({
  rows,
}: {
  rows: WorkspaceOrganisationRow[];
}) {
  return (
    <PanelChrome title="Organisations" count={rows.length}>
      {rows.map((o) => (
        <li key={o.id} className="px-4 py-3">
          <p className="text-sm font-medium text-charcoal">{o.name}</p>
          {muted(o.type)}
          {muted(o.description)}
        </li>
      ))}
    </PanelChrome>
  );
}

export function DealsDataPanel({ rows }: { rows: WorkspaceDealRow[] }) {
  return (
    <PanelChrome title="Deal canvas" count={rows.length}>
      {rows.map((d) => {
        const meta = [d.sector, d.structure, d.status]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={d.id} className="px-4 py-3">
            <p className="text-sm font-medium text-charcoal">{d.title}</p>
            {d.size != null ? (
              <p className="mt-0.5 text-xs text-charcoal-light/85">
                Size {d.size.toLocaleString()}
              </p>
            ) : null}
            {muted(meta || null)}
          </li>
        );
      })}
    </PanelChrome>
  );
}

export function SuggestionsDataPanel({
  rows,
}: {
  rows: WorkspaceSuggestionRow[];
}) {
  return (
    <PanelChrome title="Suggestions" count={rows.length}>
      {rows.map((s) => (
        <li key={s.id} className="px-4 py-3">
          <p className="text-sm font-medium text-charcoal">
            {s.title?.trim() || "Suggestion"}
          </p>
          {muted(s.body)}
        </li>
      ))}
    </PanelChrome>
  );
}
