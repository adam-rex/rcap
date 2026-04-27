"use client";

import { CHAT_NAV_ITEMS } from "./chat-nav-config";
import type { ChatNavId } from "./chat-nav-config";

type ChatMobileNavProps = {
  activeId: ChatNavId;
  onNavigate: (id: ChatNavId) => void;
};

export function ChatMobileNav({ activeId, onNavigate }: ChatMobileNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-charcoal/[0.08] bg-cream-light/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-sm lg:hidden"
      aria-label="Main"
    >
      <div className="flex h-14 items-stretch">
        {CHAT_NAV_ITEMS.map(({ id, label, icon: Icon, hidden }) => {
          if (hidden) return null;
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={[
                "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium leading-tight transition-colors",
                active
                  ? "text-charcoal"
                  : "text-charcoal-light hover:text-charcoal",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={[
                  "size-[22px] shrink-0",
                  active ? "text-charcoal" : "opacity-75",
                ].join(" ")}
                strokeWidth={active ? 2 : 1.75}
                aria-hidden
              />
              <span className="max-w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
