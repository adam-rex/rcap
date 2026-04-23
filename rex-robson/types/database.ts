export type Organisation = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  created_at: string;
};

export type Contact = {
  id: string;
  name: string;
  organisation_id: string | null;
  role: string | null;
  deal_types: string[] | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  sectors: string[] | null;
  geography: string | null;
  relationship_score: number | null;
  last_contact_date: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  embedding: string | null;
};

export type MatchKind = "founder_investor" | "founder_lender";

export type MatchStage = "introduced" | "active" | "closed";

export type MatchOutcome = "won" | "lost" | "passed";

export type Match = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  kind: MatchKind;
  stage: MatchStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
  suggestion_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Suggestion = {
  id: string;
  title: string | null;
  body: string | null;
  status: "pending" | "dismissed" | "acted";
  contact_a_id: string | null;
  contact_b_id: string | null;
  kind: MatchKind | null;
  score: number | null;
  created_at: string;
};

export type RexTaskStatus =
  | "pending"
  | "running"
  | "done"
  | "dismissed"
  | "failed";

export type RexTaskSource = "manual" | "meeting_note" | "email" | "import";

export type RexTaskType =
  | "draft_intro_email"
  | "compile_match_brief"
  | "research_counterparty"
  | "summarise_call_notes"
  | "custom";

export type RexTaskOutputFormat =
  | "email_draft"
  | "brief"
  | "research"
  | "summary"
  | "note";

export type RexTask = {
  id: string;
  title: string;
  detail: string | null;
  status: RexTaskStatus;
  source: RexTaskSource;
  task_type: RexTaskType;
  prompt: string | null;
  output: string | null;
  output_format: RexTaskOutputFormat | null;
  error: string | null;
  match_id: string | null;
  contact_id: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
