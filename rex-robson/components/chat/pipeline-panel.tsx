"use client";

import { useState } from "react";
import { DealsBrowsePanel } from "./deals-browse-panel";
import { RexTasksPanel } from "./rex-tasks-panel";

type PipelineSubView = "deals" | "tasks";

const SUB_VIEWS: { id: PipelineSubView; label: string }[] = [
  { id: "deals", label: "Deals" },
  { id: "tasks", label: "Tasks" },
];

function subTabClass(active: boolean) {
  return [
    "flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors",
    active
      ? "bg-cream text-charcoal shadow-sm"
      : "text-charcoal-light hover:text-charcoal",
  ].join(" ");
}

export function PipelinePanel() {
  const [subView, setSubView] = useState<PipelineSubView>("deals");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-charcoal/[0.06] bg-cream-light/60 px-4 py-3 sm:px-8">
        <div
          className="mx-auto flex w-full max-w-3xl rounded-lg bg-charcoal/[0.05] p-0.5"
          role="tablist"
          aria-label="Pipeline sub-views"
        >
          {SUB_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={subView === view.id}
              onClick={() => setSubView(view.id)}
              className={subTabClass(subView === view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {subView === "deals" ? <DealsBrowsePanel /> : <RexTasksPanel />}
      </div>
    </div>
  );
}
