import { ChatShell } from "@/components/chat";
import { parseChatNavQuery } from "@/components/chat/chat-nav-config";
import { getRexDashboardStats } from "@/lib/data/dashboard-counts";
import { getDashboardMetrics } from "@/lib/data/dashboard-metrics";
import { getWorkspaceLists } from "@/lib/data/workspace-lists";
import { buildRexOpeningGreeting } from "@/lib/rex/voice";

type HomeProps = {
  searchParams: Promise<{ nav?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  try {
    const sp = await searchParams;
    const [stats, workspace, metrics] = await Promise.all([
      getRexDashboardStats(),
      getWorkspaceLists(),
      getDashboardMetrics(),
    ]);
    const openingGreeting = buildRexOpeningGreeting(stats);
    const navRaw = sp.nav;
    const navParam =
      typeof navRaw === "string"
        ? navRaw
        : Array.isArray(navRaw)
          ? navRaw[0]
          : undefined;
    const initialActiveNav = parseChatNavQuery(navParam);

    return (
      <ChatShell
        openingGreeting={openingGreeting}
        stats={stats}
        workspace={workspace}
        metrics={metrics}
        initialActiveNav={initialActiveNav}
      />
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong loading Rex.";
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-6 text-charcoal"
        style={{ backgroundColor: "#f5f5f0", minHeight: "100vh" }}
      >
        <h1 className="font-serif text-xl">Rex couldn&apos;t load this page</h1>
        <p className="max-w-md text-center text-sm text-charcoal-light/90">
          {message}
        </p>
        <p className="max-w-md text-center text-xs text-charcoal-light/70">
          Confirm <code className="rounded bg-charcoal/5 px-1">.env.local</code>{" "}
          has valid Supabase keys, run{" "}
          <code className="rounded bg-charcoal/5 px-1">npm install</code> (repo
          targets Next 16), then{" "}
          <code className="rounded bg-charcoal/5 px-1">npm run dev:clean</code>.
        </p>
      </div>
    );
  }
}
