import { ChatShell } from "@/components/chat";
import { getRexDashboardStats } from "@/lib/data/dashboard-counts";
import { getWorkspaceLists } from "@/lib/data/workspace-lists";
import { buildRexOpeningGreeting } from "@/lib/rex/voice";

export default async function Home() {
  const [stats, workspace] = await Promise.all([
    getRexDashboardStats(),
    getWorkspaceLists(),
  ]);
  const openingGreeting = buildRexOpeningGreeting(stats);

  return (
    <ChatShell
      openingGreeting={openingGreeting}
      stats={stats}
      workspace={workspace}
    />
  );
}
