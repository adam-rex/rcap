export const WORKSPACE_DEALS_PAGE_SIZE_DEFAULT = 8;
export const WORKSPACE_DEALS_PAGE_SIZE_MAX = 50;

export type WorkspaceDealPageRow = {
  id: string;
  title: string;
  size: number | null;
  deal_type: string | null;
  deal_stage: "prospect" | "active" | "matching" | "closed";
  sector: string | null;
  structure: string | null;
  status: string | null;
};

export type WorkspaceDealsPageResult = {
  rows: WorkspaceDealPageRow[];
  total: number;
};
