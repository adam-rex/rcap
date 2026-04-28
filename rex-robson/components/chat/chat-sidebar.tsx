"use client";

import { CHAT_NAV_ITEMS, type ChatNavId } from "./chat-nav-config";

export type { ChatNavId } from "./chat-nav-config";

type ChatSidebarProps = {
  activeId?: ChatNavId;
  onNavigate?: (id: ChatNavId) => void;
};

export function ChatSidebar({
  activeId = "dashboard",
  onNavigate,
}: ChatSidebarProps) {
  return (
    <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r border-charcoal/[0.08] bg-cream-light/80 backdrop-blur-sm lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-charcoal/[0.06] px-4">
        <span className="font-serif text-lg tracking-tight text-charcoal">
          Rex
        </span>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2"
        aria-label="Main"
      >
        {CHAT_NAV_ITEMS.map(({ id, label, icon: Icon, hidden }) => {
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
    </aside>
  );
}
