/** Expected contact_type values used in filters and forms. */
export const WORKSPACE_CONTACT_TYPES = [
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
] as const;

export type WorkspaceContactType = (typeof WORKSPACE_CONTACT_TYPES)[number];
