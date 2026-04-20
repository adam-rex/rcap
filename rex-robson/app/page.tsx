import { ChatShell } from "@/components/chat";
import { getRexDashboardStats } from "@/lib/data/dashboard-counts";
import { getDashboardMetrics } from "@/lib/data/dashboard-metrics";
import { getWorkspaceLists } from "@/lib/data/workspace-lists";
import { buildRexOpeningGreeting } from "@/lib/rex/voice";

export default async function Home() {
  const [stats, workspace, metrics] = await Promise.all([
    getRexDashboardStats(),
    getWorkspaceLists(),
    getDashboardMetrics(),
  ]);
  const openingGreeting = buildRexOpeningGreeting(stats);

  return (
    <ChatShell
      openingGreeting={openingGreeting}
      stats={stats}
      workspace={workspace}
      metrics={metrics}
    />
  );
}
