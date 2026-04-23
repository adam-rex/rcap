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
