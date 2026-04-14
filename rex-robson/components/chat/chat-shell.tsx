"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceLists } from "@/lib/data/workspace-lists";
import type { RexDashboardStats } from "@/lib/rex/voice";
import { rexEmptySuggestions } from "@/lib/rex/voice";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList, type ChatMessage } from "./chat-message-list";
import { ChatSidebar, type ChatNavId, type WorkspaceDisplayMode } from "./chat-sidebar";
import { ContactsBrowsePanel } from "./contacts-browse-panel";
import { DealsBrowsePanel } from "./deals-browse-panel";
import { EmailsBrowsePanel } from "./emails-browse-panel";
import { OrganisationsBrowsePanel } from "./organisations-browse-panel";
import { RexTasksPanel } from "./rex-tasks-panel";
import { UploadImportPanel } from "./upload-import-panel";
import { SuggestionsDataPanel } from "./workspace-data-panels";

const WORKSPACE_DISPLAY_KEY = "rex-workspace-display";

const ZERO_STATS: RexDashboardStats = {
  contactCount: 0,
  organisationCount: 0,
  openDealCount: 0,
  suggestionsPendingCount: 0,
  suggestionTotalCount: 0,
};

const EMPTY_WORKSPACE: WorkspaceLists = {
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
    <div className="flex h-dvh max-h-dvh flex-1 overflow-hidden bg-cream">
      <ChatSidebar
        activeId={activeNav}
        onNavigate={setActiveNav}
        workspaceDisplayMode={workspaceDisplayMode}
        onWorkspaceDisplayModeChange={persistWorkspaceDisplayMode}
      />
      <div className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-charcoal/[0.08] bg-cream-light/80 px-4 backdrop-blur-sm sm:px-6">
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
        <main
          className={
            activeNav === "ask"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "flex min-h-0 flex-1 flex-col overflow-y-auto"
          }
        >
          {activeNav === "ask" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatMessageList messages={messages} />
              <div className="shrink-0">
                <ChatComposer
                  onSubmitSearch={onSubmitSearch}
                  isBusy={searchBusy}
                />
              </div>
            </div>
          ) : activeNav === "contacts" ? (
            <ContactsBrowsePanel />
          ) : activeNav === "organisations" ? (
            <OrganisationsBrowsePanel />
          ) : activeNav === "deal-canvas" ? (
            <DealsBrowsePanel />
          ) : activeNav === "tasks" ? (
            <RexTasksPanel />
          ) : activeNav === "suggestions" ? (
            effectiveStats.suggestionsPendingCount === 0 ? (
              <RexVoicePanel title="Suggestions" message={rexEmptySuggestions} />
            ) : (
              <SuggestionsDataPanel rows={effectiveWorkspace.suggestions} />
            )
          ) : activeNav === "upload" ? (
            <UploadImportPanel onGoToSuggestions={() => setActiveNav("suggestions")} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
