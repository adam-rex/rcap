"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceLists } from "@/lib/data/workspace-lists";
import type { RexDashboardStats } from "@/lib/rex/voice";
import {
  rexEmptyContacts,
  rexEmptyDealCanvas,
  rexEmptyOrganisations,
  rexEmptySuggestions,
  rexEmptyUpload,
} from "@/lib/rex/voice";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList, type ChatMessage } from "./chat-message-list";
import { ChatSidebar, type ChatNavId, type WorkspaceDisplayMode } from "./chat-sidebar";
import {
  ContactsDataPanel,
  DealsDataPanel,
  OrganisationsDataPanel,
  SuggestionsDataPanel,
} from "./workspace-data-panels";

const WORKSPACE_DISPLAY_KEY = "rex-workspace-display";

const ZERO_STATS: RexDashboardStats = {
  contactCount: 0,
  organisationCount: 0,
  openDealCount: 0,
  suggestionsPendingCount: 0,
  suggestionTotalCount: 0,
};

const EMPTY_WORKSPACE: WorkspaceLists = {
  contacts: [],
  organisations: [],
  deals: [],
  suggestions: [],
};

type ChatShellProps = {
  openingGreeting: string;
  stats: RexDashboardStats;
  workspace: WorkspaceLists;
};

function RexVoicePanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
      <h2 className="font-serif text-xl tracking-tight text-charcoal">
        {title}
      </h2>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal-light">
        {message}
      </p>
    </div>
  );
}

export function ChatShell({
  openingGreeting,
  stats,
  workspace,
}: ChatShellProps) {
  const [activeNav, setActiveNav] = useState<ChatNavId>("ask");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "rex-open", role: "rex", text: openingGreeting },
  ]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [workspaceDisplayMode, setWorkspaceDisplayMode] =
    useState<WorkspaceDisplayMode>("live");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKSPACE_DISPLAY_KEY);
      if (raw === "empty" || raw === "live") {
        setWorkspaceDisplayMode(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistWorkspaceDisplayMode = useCallback((mode: WorkspaceDisplayMode) => {
    setWorkspaceDisplayMode(mode);
    try {
      localStorage.setItem(WORKSPACE_DISPLAY_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const effectiveStats =
    workspaceDisplayMode === "empty" ? ZERO_STATS : stats;
  const effectiveWorkspace =
    workspaceDisplayMode === "empty" ? EMPTY_WORKSPACE : workspace;

  const onSubmitSearch = useCallback(async (query: string) => {
    const userId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: query },
    ]);
    setSearchBusy(true);
    try {
      const res = await fetch("/api/rex/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      const rexId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `rex-${Date.now()}`;
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: rexId,
            role: "rex",
            text:
              data.error ??
              "That search didn’t go through. Check the API key and try again.",
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: rexId,
          role: "rex",
          text: data.text ?? "No text came back — odd.",
        },
      ]);
    } catch {
      const rexId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `rex-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: rexId,
          role: "rex",
          text: "Network hiccup. Try again in a moment.",
        },
      ]);
    } finally {
      setSearchBusy(false);
    }
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-1 bg-cream">
      <ChatSidebar
        activeId={activeNav}
        onNavigate={setActiveNav}
        workspaceDisplayMode={workspaceDisplayMode}
        onWorkspaceDisplayModeChange={persistWorkspaceDisplayMode}
      />
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
          {activeNav === "ask" ? (
            <>
              <ChatMessageList messages={messages} />
              <ChatComposer
                onSubmitSearch={onSubmitSearch}
                isBusy={searchBusy}
              />
            </>
          ) : activeNav === "contacts" ? (
            effectiveStats.contactCount === 0 ? (
              <RexVoicePanel title="Contacts" message={rexEmptyContacts} />
            ) : (
              <ContactsDataPanel rows={effectiveWorkspace.contacts} />
            )
          ) : activeNav === "organisations" ? (
            effectiveStats.organisationCount === 0 ? (
              <RexVoicePanel
                title="Organisations"
                message={rexEmptyOrganisations}
              />
            ) : (
              <OrganisationsDataPanel rows={effectiveWorkspace.organisations} />
            )
          ) : activeNav === "deal-canvas" ? (
            effectiveStats.openDealCount === 0 ? (
              <RexVoicePanel title="Deal Canvas" message={rexEmptyDealCanvas} />
            ) : (
              <DealsDataPanel rows={effectiveWorkspace.deals} />
            )
          ) : activeNav === "suggestions" ? (
            effectiveStats.suggestionsPendingCount === 0 ? (
              <RexVoicePanel title="Suggestions" message={rexEmptySuggestions} />
            ) : (
              <SuggestionsDataPanel rows={effectiveWorkspace.suggestions} />
            )
          ) : (
            <RexVoicePanel title="Upload & Import" message={rexEmptyUpload} />
          )}
        </main>
      </div>
    </div>
  );
}
