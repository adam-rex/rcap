export const WORKSPACE_EMAILS_PAGE_SIZE_DEFAULT = 12;
export const WORKSPACE_EMAILS_PAGE_SIZE_MAX = 50;

export type RexEmailExtractionKind =
  | "contact"
  | "organisation"
  | "deal_signal"
  | "intro_request";

export type RexEmailExtractionStatus = "pending" | "applied" | "dismissed";

export type WorkspaceEmailExtractionListItem = {
  id: string;
  kind: RexEmailExtractionKind;
  status: RexEmailExtractionStatus;
  title: string;
  summary: string | null;
  detail: string | null;
  payload: Record<string, unknown>;
  createdContactId: string | null;
  createdOrganisationId: string | null;
  createdDealId: string | null;
  createdSuggestionId: string | null;
};

export type WorkspaceEmailListRow = {
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  snippet: string | null;
  receivedAt: string;
  /** Pending Rex inbox items for this message (badge in list). */
  pendingReviewCount: number;
};

export type WorkspaceEmailsPageResult = {
  rows: WorkspaceEmailListRow[];
  total: number;
};

export type WorkspaceEmailAttachmentRow = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  storageBucket: string | null;
  storagePath: string | null;
};

export type WorkspaceEmailDetail = {
  id: string;
  receivedAt: string;
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  threadParticipantCount: number | null;
  attachments: WorkspaceEmailAttachmentRow[];
  extractions: WorkspaceEmailExtractionListItem[];
};
