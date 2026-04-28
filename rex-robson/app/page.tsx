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
  const [stats, workspace, metrics, sp] = await Promise.all([
    getRexDashboardStats(),
    getWorkspaceLists(),
    getDashboardMetrics(),
    searchParams,
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
}
