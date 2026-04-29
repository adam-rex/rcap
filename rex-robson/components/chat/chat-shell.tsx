"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DashboardMetrics } from "@/lib/data/dashboard-metrics.types";
import type { WorkspaceLists } from "@/lib/data/workspace-lists";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RexDashboardStats } from "@/lib/rex/voice";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList, type ChatMessage } from "./chat-message-list";
import {
  chatNavLabel,
  MOBILE_SHELL_BOTTOM_PAD_CLASS,
  parseChatNavQuery,
  type ChatNavId,
} from "./chat-nav-config";
import { ChatMobileNav } from "./chat-mobile-nav";
import { ChatSidebar } from "./chat-sidebar";
import { ContactsBrowsePanel } from "./contacts-browse-panel";
import { DashboardPanel } from "./dashboard-panel";
import { EmailsBrowsePanel } from "./emails-browse-panel";
import { OrganisationsBrowsePanel } from "./organisations-browse-panel";
import { OpportunitiesPanel } from "./opportunities-panel";
import { PipelinePanel } from "./pipeline-panel";
import { QuickCaptureDialog } from "./quick-capture-dialog";
import { QuickCaptureFab } from "./quick-capture-fab";
import { SuggestionsPanel } from "./suggestions-panel";

type ChatShellProps = {
  openingGreeting: string;
  stats: RexDashboardStats;
  workspace: WorkspaceLists;
  metrics: DashboardMetrics;
  /** When opening `/` with `?nav=…`, which shell panel to show first. */
  initialActiveNav?: ChatNavId | null;
};

export function ChatShell({
  openingGreeting,
  stats,
  workspace,
  metrics,
  initialActiveNav = null,
}: ChatShellProps) {
  const [activeNav, setActiveNav] = useState<ChatNavId>(
    () => initialActiveNav ?? "dashboard",
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "rex-open", role: "rex", text: openingGreeting },
  ]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [pendingContactsAutoCreate, setPendingContactsAutoCreate] =
    useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [pendingEmailDetailId, setPendingEmailDetailId] = useState<string | null>(
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = parseChatNavQuery(params.get("nav"));
    if (fromQuery != null) {
      setActiveNav(fromQuery);
      router.replace("/", { scroll: false });
    }
  }, [router]);

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

  const onSignOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

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
      <ChatSidebar activeId={activeNav} onNavigate={setActiveNav} />
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
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="shrink-0 rounded-lg border border-charcoal/[0.15] bg-cream-light/90 px-2.5 py-1.5 text-xs font-medium text-charcoal hover:bg-charcoal/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal/25"
            >
              Sign out
            </button>
          </div>
          {!quickCaptureOpen ? (
            <button
              type="button"
              onClick={onOpenQuickCapture}
              className="lg:hidden -mr-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-charcoal/[0.12] bg-charcoal text-cream shadow-sm transition-colors hover:bg-charcoal/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/25 sm:-mr-1"
              aria-label="Quick Capture — add a contact"
            >
              <Plus className="size-5" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
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
              metrics={metrics}
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
              rows={workspace.suggestions}
              isEmpty={stats.suggestionsPendingCount === 0}
            />
          ) : activeNav === "opportunities" ? (
            <OpportunitiesPanel />
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
