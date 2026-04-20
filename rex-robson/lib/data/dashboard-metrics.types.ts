export type DashboardMetrics = {
  contactCount: number;
  contactsNew30d: number;
  openDealCount: number;
  openPipelineValue: number;
  avgDealSize: number | null;
};

export const ZERO_DASHBOARD_METRICS: DashboardMetrics = {
  contactCount: 0,
  contactsNew30d: 0,
  openDealCount: 0,
  openPipelineValue: 0,
  avgDealSize: null,
};
