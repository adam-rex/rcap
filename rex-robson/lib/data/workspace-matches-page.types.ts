export type MatchStage = "introduced" | "active" | "closed";
export type MatchOutcome = "won" | "lost" | "passed";
export type MatchKind = "founder_investor" | "founder_lender";

export type WorkspaceMatchPageRow = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  kind: MatchKind;
  stage: MatchStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
};

export type WorkspaceMatchesPageResult = {
  rows: WorkspaceMatchPageRow[];
  total: number;
};

export const WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT = 8;
export const WORKSPACE_MATCHES_PAGE_SIZE_MAX = 500;
