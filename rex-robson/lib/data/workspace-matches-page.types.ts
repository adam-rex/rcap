export type MatchKind = "founder_investor" | "founder_lender";
export type MatchOutcome = "won" | "lost" | "passed";

/** Open opportunity (pair) lifecycle — not pipeline deal stage. */
export type OpportunityStage = "introduced" | "closed";

/** A single deal on the pipeline (many per opportunity / match). */
export type PipelineTransactionStage = "active" | "closed";

/** Internal workspace comment on a pipeline deal (not Rex). */
export type PipelineInternalComment = {
  id: string;
  body: string;
  created_at: string;
};

/** Internal workspace to-do on a pipeline deal (not Rex). */
export type PipelineInternalTodo = {
  id: string;
  body: string;
  done: boolean;
  created_at: string;
};

export type WorkspacePipelineTransactionRow = {
  id: string;
  match_id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  kind: MatchKind;
  stage: PipelineTransactionStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
  title: string | null;
  internal_comments: PipelineInternalComment[];
  internal_todos: PipelineInternalTodo[];
};

/** @deprecated Use WorkspacePipelineTransactionRow — kept as alias for incremental refactors. */
export type WorkspaceMatchPageRow = WorkspacePipelineTransactionRow;

export type WorkspaceMatchesPageResult = {
  rows: WorkspacePipelineTransactionRow[];
  total: number;
};

export const WORKSPACE_MATCHES_PAGE_SIZE_DEFAULT = 8;
export const WORKSPACE_MATCHES_PAGE_SIZE_MAX = 500;
