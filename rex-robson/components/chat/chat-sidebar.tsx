"use client";

import {
  Building2,
  FileUp,
  LayoutGrid,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";

const navItems = [
  { id: "ask", label: "Ask Rex", icon: MessageCircle },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "organisations", label: "Organisations", icon: Building2 },
  { id: "deal-canvas", label: "Deal Canvas", icon: LayoutGrid },
  { id: "suggestions", label: "Suggestions", icon: Sparkles },
  { id: "upload", label: "Upload & Import", icon: FileUp },
] as const;

export type ChatNavId = (typeof navItems)[number]["id"];

type ChatSidebarProps = {
  activeId?: ChatNavId;
  onNavigate?: (id: ChatNavId) => void;
};

export function ChatSidebar({
  activeId = "ask",
  onNavigate,
}: ChatSidebarProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-charcoal/[0.08] bg-cream-light/80 backdrop-blur-sm">
      <div className="flex h-14 items-center border-b border-charcoal/[0.06] px-4">
        <span className="font-serif text-lg tracking-tight text-charcoal">
          Rex
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main">
        {navItems.map(({ id, label, icon: Icon }) => {
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
    </aside>
  );
}
