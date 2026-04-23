export type MatchStage = "introduced" | "active" | "closed";

export type MatchesByStage = Record<MatchStage, number>;

export type SectorBreakdownEntry = {
  sector: string;
  count: number;
  /** Reserved for future per-sector value math; kept for chart compatibility. */
  value: number;
};

export type DashboardMetrics = {
  contactCount: number;
  contactsNew30d: number;
  /** Open = stage in (introduced, active). */
  openMatchCount: number;
  matchesByStage: MatchesByStage;
  matchesBySector: SectorBreakdownEntry[];
  sectorTotalCount: number;
  sectorUnknownCount: number;
  /** stage='active' tile. */
  activeMatchesCount: number;
  /** suggestions.status='pending' tile. */
  pendingSuggestionsCount: number;
};

export const ZERO_MATCHES_BY_STAGE: MatchesByStage = {
  introduced: 0,
  active: 0,
  closed: 0,
};

export const ZERO_DASHBOARD_METRICS: DashboardMetrics = {
  contactCount: 0,
  contactsNew30d: 0,
  openMatchCount: 0,
  matchesByStage: { ...ZERO_MATCHES_BY_STAGE },
  matchesBySector: [],
  sectorTotalCount: 0,
  sectorUnknownCount: 0,
  activeMatchesCount: 0,
  pendingSuggestionsCount: 0,
};
