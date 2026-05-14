/**
 * Canonical role slugs for contacts (multi-select tags on a contact).
 * Independent of `contacts.contact_type` — a contact may be both a corporate
 * Lender (institution) and a personal SPV investor, etc. Add new roles here.
 * Stored as `contacts.roles text[]` and filtered via array overlap.
 *
 * This file is the single source of truth for both the canonical slugs
 * (DB / API / prompt-facing) and the human-readable display labels. Other
 * modules should import from here rather than hardcoding either form.
 */
export const WORKSPACE_CONTACT_ROLE_SLUGS = [
  "spv_investor",
  "spv_borrower",
] as const;

export type WorkspaceContactRoleSlug =
  (typeof WORKSPACE_CONTACT_ROLE_SLUGS)[number];

export const WORKSPACE_CONTACT_ROLE_SLUG_SET = new Set<string>(
  WORKSPACE_CONTACT_ROLE_SLUGS,
);

/** Human-readable labels for checkbox / chip UI. Slugs stay snake_case in API/DB. */
export const WORKSPACE_CONTACT_ROLE_LABEL: Record<
  WorkspaceContactRoleSlug,
  string
> = {
  spv_investor: "SPV Investor",
  spv_borrower: "SPV Borrower",
};

export function isWorkspaceContactRoleSlug(
  s: string,
): s is WorkspaceContactRoleSlug {
  return WORKSPACE_CONTACT_ROLE_SLUG_SET.has(s);
}

/** Parse a comma-separated `roles` query param into a deduped slug list. */
export function parseRolesQuery(raw: string | null): WorkspaceContactRoleSlug[] {
  if (raw == null || raw.trim() === "") return [];
  const out: WorkspaceContactRoleSlug[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase();
    if (t && isWorkspaceContactRoleSlug(t)) out.push(t);
  }
  return [...new Set(out)];
}

/** Serialise a set/list of role slugs to a canonical sorted CSV. */
export function formatRolesQuery(roles: Iterable<string>): string {
  return [...new Set([...roles].filter(isWorkspaceContactRoleSlug))]
    .sort()
    .join(",");
}

/** Filter an unknown value into a clean slug list (drop unknowns, dedupe). */
export function sanitizeRolesList(raw: unknown): WorkspaceContactRoleSlug[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkspaceContactRoleSlug[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (t && isWorkspaceContactRoleSlug(t)) out.push(t);
  }
  return [...new Set(out)];
}
