export type DealStage = "prospect" | "active" | "matching" | "closed";

export type DealsByStage = Record<DealStage, number>;

export type SectorBreakdownEntry = {
  sector: string;
  count: number;
  value: number;
};

export type DashboardMetrics = {
  contactCount: number;
  contactsNew30d: number;
  openDealCount: number;
  openPipelineValue: number;
  avgDealSize: number | null;
  dealsByStage: DealsByStage;
  dealsBySector: SectorBreakdownEntry[];
  sectorTotalCount: number;
  sectorUnknownCount: number;
  matchingCount: number;
  matchingValue: number;
  suggestionsPendingCount: number;
};

export const ZERO_DEALS_BY_STAGE: DealsByStage = {
  prospect: 0,
  active: 0,
  matching: 0,
  closed: 0,
};

export const ZERO_DASHBOARD_METRICS: DashboardMetrics = {
  contactCount: 0,
  contactsNew30d: 0,
  openDealCount: 0,
  openPipelineValue: 0,
  avgDealSize: null,
  dealsByStage: { ...ZERO_DEALS_BY_STAGE },
  dealsBySector: [],
  sectorTotalCount: 0,
  sectorUnknownCount: 0,
  matchingCount: 0,
  matchingValue: 0,
  suggestionsPendingCount: 0,
};
