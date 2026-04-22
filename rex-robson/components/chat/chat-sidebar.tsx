"use client";

import {
  Building2,
  LayoutDashboard,
  LayoutGrid,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, hidden: false },
  { id: "ask", label: "Ask Rex", icon: MessageCircle, hidden: false },
  { id: "contacts", label: "Contacts", icon: Users, hidden: false },
  { id: "organisations", label: "Organisations", icon: Building2, hidden: true },
  { id: "pipeline", label: "Pipeline", icon: LayoutGrid, hidden: false },
  { id: "suggestions", label: "Suggestions", icon: Sparkles, hidden: false },
] as const;

export type ChatNavId = (typeof navItems)[number]["id"];

export type WorkspaceDisplayMode = "live" | "empty";

type ChatSidebarProps = {
  activeId?: ChatNavId;
  onNavigate?: (id: ChatNavId) => void;
  workspaceDisplayMode?: WorkspaceDisplayMode;
  onWorkspaceDisplayModeChange?: (mode: WorkspaceDisplayMode) => void;
};

function modeButtonClass(active: boolean) {
  return [
    "flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors",
    active
      ? "bg-cream text-charcoal shadow-sm"
      : "text-charcoal-light hover:text-charcoal",
  ].join(" ");
}

export function ChatSidebar({
  activeId = "dashboard",
  onNavigate,
  workspaceDisplayMode = "live",
  onWorkspaceDisplayModeChange,
}: ChatSidebarProps) {
  return (
    <aside className="flex h-dvh w-56 shrink-0 flex-col overflow-hidden border-r border-charcoal/[0.08] bg-cream-light/80 backdrop-blur-sm">
      <div className="flex h-14 shrink-0 items-center border-b border-charcoal/[0.06] px-4">
        <span className="font-serif text-lg tracking-tight text-charcoal">
          Rex
        </span>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2"
        aria-label="Main"
      >
        {navItems.map(({ id, label, icon: Icon, hidden }) => {
          if (hidden) return null;
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate?.(id)}
              className={[
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-charcoal text-cream"
                  : "text-charcoal-light hover:bg-charcoal/[0.06]",
              ].join(" ")}
            >
              <Icon
                className="size-4 shrink-0 opacity-80"
                strokeWidth={1.75}
                aria-hidden
              />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-charcoal/[0.06] p-2">
        <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wide text-charcoal-light/70">
          Workspace display
        </p>
        <div
          className="flex rounded-lg bg-charcoal/[0.05] p-0.5"
          role="group"
          aria-label="Workspace display mode"
        >
          <button
            type="button"
            className={modeButtonClass(workspaceDisplayMode === "live")}
            onClick={() => onWorkspaceDisplayModeChange?.("live")}
          >
            Live data
          </button>
          <button
            type="button"
            className={modeButtonClass(workspaceDisplayMode === "empty")}
            onClick={() => onWorkspaceDisplayModeChange?.("empty")}
          >
            Empty
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[10px] leading-snug text-charcoal-light/65">
          Empty previews the zero-state copy even when the database has rows.
        </p>
      </div>
    </aside>
  );
}
