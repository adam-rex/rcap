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

export type Deal = {
  id: string;
  title: string;
  size: number | null;
  sector: string | null;
  structure: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  embedding: string | null;
};
