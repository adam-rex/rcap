/**
 * Rex voice: UI copy and greeting builders. LLM / Anthropic prompt assembly lives in
 * `lib/prompts` (import from `@/lib/prompts`).
 */

export type RexDashboardStats = {
  contactCount: number;
  organisationCount: number;
  openDealCount: number;
  suggestionsPendingCount: number;
  /** All rows; empty-state copy when zero */
  suggestionTotalCount: number;
};

function timeOfDayWord(date: Date): "Morning" | "Afternoon" | "Evening" {
  const h = date.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

function networkLine(stats: RexDashboardStats): string {
  if (stats.contactCount > 0) return "Network's looking good.";
  return "Network's thin — we'll build it.";
}

/**
 * First message in chat on load; embeds live counts.
 */
export function buildRexOpeningGreeting(
  stats: RexDashboardStats,
  now: Date = new Date(),
): string {
  const t = timeOfDayWord(now);
  const net = networkLine(stats);
  const { contactCount, openDealCount, suggestionsPendingCount } = stats;
  const bits = [
    `${contactCount} contact${contactCount === 1 ? "" : "s"}`,
    `${openDealCount} open deal${openDealCount === 1 ? "" : "s"}`,
    `${suggestionsPendingCount} suggestion${suggestionsPendingCount === 1 ? "" : "s"} waiting`,
  ];
  return `${t}. ${net} ${bits.join(", ")} — worth your attention today. Ask me anything.`;
}

export const rexEmptyContacts =
  "Nothing here yet. Tell me who you met.";

export const rexEmptySuggestions =
  "No suggestions right now. Either your network is perfect or you haven't fed me enough. Probably the latter.";

export const rexEmptyDealCanvas = "No deals on the canvas. Let's fix that.";

export const rexEmptyOrganisations =
  "No organisations yet. Map the players before the deals get fuzzy.";

export const rexEmptyUpload =
  "Nothing uploaded. Drop a stack of cards or a messy CSV — I'll make sense of it.";
