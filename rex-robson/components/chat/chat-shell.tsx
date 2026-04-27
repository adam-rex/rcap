"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ZERO_DASHBOARD_METRICS,
  type DashboardMetrics,
} from "@/lib/data/dashboard-metrics.types";
import type { WorkspaceLists } from "@/lib/data/workspace-lists";
import type { RexDashboardStats } from "@/lib/rex/voice";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList, type ChatMessage } from "./chat-message-list";
import {
  chatNavLabel,
  MOBILE_SHELL_BOTTOM_PAD_CLASS,
  workspaceModeButtonClass,
  type ChatNavId,
  type WorkspaceDisplayMode,
} from "./chat-nav-config";
import { ChatMobileNav } from "./chat-mobile-nav";
import { ChatSidebar } from "./chat-sidebar";
import { ContactsBrowsePanel } from "./contacts-browse-panel";
import { DashboardPanel } from "./dashboard-panel";
import { EmailsBrowsePanel } from "./emails-browse-panel";
import { OrganisationsBrowsePanel } from "./organisations-browse-panel";
import { PipelinePanel } from "./pipeline-panel";
import { QuickCaptureDialog } from "./quick-capture-dialog";
import { QuickCaptureFab } from "./quick-capture-fab";
import { SuggestionsPanel } from "./suggestions-panel";

const WORKSPACE_DISPLAY_KEY = "rex-workspace-display";

const ZERO_STATS: RexDashboardStats = {
  contactCount: 0,
  organisationCount: 0,
  openMatchCount: 0,
  activeMatchCount: 0,
  suggestionsPendingCount: 0,
  suggestionTotalCount: 0,
};

const EMPTY_WORKSPACE: WorkspaceLists = {
  organisations: [],
  matches: [],
  suggestions: [],
};

type ChatShellProps = {
  openingGreeting: string;
  stats: RexDashboardStats;
  workspace: WorkspaceLists;
  metrics: DashboardMetrics;
};

export function ChatShell({
  openingGreeting,
  stats,
  workspace,
  metrics,
}: ChatShellProps) {
  const [activeNav, setActiveNav] = useState<ChatNavId>("dashboard");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "rex-open", role: "rex", text: openingGreeting },
  ]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [workspaceDisplayMode, setWorkspaceDisplayMode] =
    useState<WorkspaceDisplayMode>("live");
  const [pendingContactsAutoCreate, setPendingContactsAutoCreate] =
    useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [pendingEmailDetailId, setPendingEmailDetailId] = useState<string | null>(
    null,
  );
  const router = useRouter();

  const onAddContactFromDashboard = useCallback(() => {
    setActiveNav("contacts");
    setPendingContactsAutoCreate(true);
  }, []);

  const onContactsAutoCreateHandled = useCallback(() => {
    setPendingContactsAutoCreate(false);
  }, []);

  const onOpenQuickCapture = useCallback(() => {
    setQuickCaptureOpen(true);
  }, []);

  const onCloseQuickCapture = useCallback(() => {
    setQuickCaptureOpen(false);
  }, []);

  const onCaptured = useCallback(() => {
    router.refresh();
  }, [router]);

  const onOpenSuggestionsFromCapture = useCallback(() => {
    setActiveNav("suggestions");
  }, []);

  const onOpenEmailFromCapture = useCallback((emailId: string) => {
    setPendingEmailDetailId(emailId);
    setActiveNav("emails");
  }, []);

  const onPendingEmailDetailHandled = useCallback(() => {
    setPendingEmailDetailId(null);
  }, []);

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
  const effectiveMetrics =
    workspaceDisplayMode === "empty" ? ZERO_DASHBOARD_METRICS : metrics;

  const onSubmitSearch = useCallback(async (query: string, files: File[]) => {
    const userId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: "user",
        text: query,
        attachments:
          files.length > 0
            ? files.map((f) => ({ name: f.name, sizeBytes: f.size }))
            : undefined,
      },
    ]);
    setSearchBusy(true);
    try {
      const hasFiles = files.length > 0;
      const init: RequestInit = hasFiles
        ? (() => {
            const fd = new FormData();
            fd.append("query", query);
            for (const f of files) {
              fd.append("documents", f, f.name);
            }
            return { method: "POST", body: fd };
          })()
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          };
      const res = await fetch("/api/rex/search", init);
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
    <div className="flex min-h-0 h-dvh max-h-dvh flex-1 overflow-hidden bg-cream pt-[env(safe-area-inset-top,0px)]">
      <ChatSidebar
        activeId={activeNav}
        onNavigate={setActiveNav}
        workspaceDisplayMode={workspaceDisplayMode}
        onWorkspaceDisplayModeChange={persistWorkspaceDisplayMode}
      />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:pb-0 ${MOBILE_SHELL_BOTTOM_PAD_CLASS}`}
      >
        <header className="sticky top-0 z-10 flex min-h-14 shrink-0 items-center gap-2 border-b border-charcoal/[0.08] bg-cream-light/80 px-4 backdrop-blur-sm sm:gap-3 sm:px-6">
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
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg tracking-tight text-charcoal lg:hidden">
              {chatNavLabel(activeNav)}
            </h1>
            <p className="text-xs text-charcoal-light/80 lg:hidden">Online</p>
            <h1 className="hidden truncate font-serif text-lg tracking-tight text-charcoal lg:block">
              Rex
            </h1>
            <p className="hidden text-xs text-charcoal-light/80 lg:block">
              Online
            </p>
          </div>
          <div
            className="flex max-w-[min(100%,11rem)] shrink-0 flex-col gap-1 lg:hidden"
            role="presentation"
          >
            <p className="text-[9px] font-medium uppercase tracking-wide text-charcoal-light/70">
              Workspace
            </p>
            <div
              className="flex rounded-lg bg-charcoal/[0.05] p-0.5"
              role="group"
              aria-label="Workspace display mode"
            >
              <button
                type="button"
                className={workspaceModeButtonClass(workspaceDisplayMode === "live")}
                onClick={() => persistWorkspaceDisplayMode("live")}
              >
                Live
              </button>
              <button
                type="button"
                className={workspaceModeButtonClass(
                  workspaceDisplayMode === "empty",
                )}
                onClick={() => persistWorkspaceDisplayMode("empty")}
              >
                Empty
              </button>
            </div>
          </div>
        </header>
        <main
          className={
            activeNav === "ask"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "flex min-h-0 flex-1 flex-col overflow-y-auto"
          }
        >
          {activeNav === "dashboard" ? (
            <DashboardPanel
              metrics={effectiveMetrics}
              onAddContact={onAddContactFromDashboard}
              onOpenQuickCapture={onOpenQuickCapture}
              onOpenSuggestions={() => setActiveNav("suggestions")}
            />
          ) : activeNav === "ask" ? (
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
            <ContactsBrowsePanel
              autoOpenCreate={pendingContactsAutoCreate}
              onAutoOpenCreateHandled={onContactsAutoCreateHandled}
            />
          ) : activeNav === "emails" ? (
            <EmailsBrowsePanel
              initialEmailId={pendingEmailDetailId}
              onInitialEmailIdHandled={onPendingEmailDetailHandled}
            />
          ) : activeNav === "organisations" ? (
            <OrganisationsBrowsePanel />
          ) : activeNav === "pipeline" ? (
            <PipelinePanel />
          ) : activeNav === "suggestions" ? (
            <SuggestionsPanel
              rows={effectiveWorkspace.suggestions}
              isEmpty={effectiveStats.suggestionsPendingCount === 0}
            />
          ) : null}
        </main>
      </div>
      <QuickCaptureFab
        onClick={onOpenQuickCapture}
        hidden={quickCaptureOpen}
      />
      <ChatMobileNav activeId={activeNav} onNavigate={setActiveNav} />
      <QuickCaptureDialog
        open={quickCaptureOpen}
        onClose={onCloseQuickCapture}
        onCaptured={onCaptured}
        onOpenSuggestions={onOpenSuggestionsFromCapture}
        onOpenEmail={onOpenEmailFromCapture}
      />
    </div>
  );
}
