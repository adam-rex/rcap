export const WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT = 10;
export const WORKSPACE_CONTACTS_PAGE_SIZE_MAX = 50;

export type WorkspaceContactPageRow = {
  id: string;
  name: string;
  contact_type: string | null;
  sector: string | null;
  role: string | null;
  geography: string | null;
  last_contact_date: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_type: string | null;
  /** Rex team member who added the contact (internal). */
  internal_owner: string | null;
};

export type WorkspaceContactsPageResult = {
  rows: WorkspaceContactPageRow[];
  total: number;
};
