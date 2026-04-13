"use client";

import { useState } from "react";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";
import { ChatSidebar, type ChatNavId } from "./chat-sidebar";

export function ChatShell() {
  const [activeNav, setActiveNav] = useState<ChatNavId>("ask");

  return (
    <div className="flex min-h-[100dvh] flex-1 bg-cream">
      <ChatSidebar activeId={activeNav} onNavigate={setActiveNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-charcoal/[0.08] bg-cream-light/80 px-4 backdrop-blur-sm sm:px-6">
          <div className="relative shrink-0">
            <div
              className="flex size-9 items-center justify-center rounded-full bg-charcoal font-sans text-xs font-semibold tracking-tight text-cream"
              aria-hidden
            >
              RX
            </div>
            <span
              className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-cream-light bg-emerald-500"
              title="Online"
              aria-label="Online"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg tracking-tight text-charcoal">
              Rex
            </h1>
            <p className="text-xs text-charcoal-light/80">Online</p>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <ChatMessageList />
          <ChatComposer />
        </main>
      </div>
    </div>
  );
}
