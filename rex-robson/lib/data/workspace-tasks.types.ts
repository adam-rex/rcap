export const WORKSPACE_TASKS_PAGE_SIZE_DEFAULT = 20;
export const WORKSPACE_TASKS_PAGE_SIZE_MAX = 100;

export type WorkspaceTaskStatus =
  | "pending"
  | "running"
  | "done"
  | "dismissed"
  | "failed";
export type WorkspaceTaskSource = "manual" | "meeting_note" | "email" | "import";

export type WorkspaceTaskType =
  | "draft_intro_email"
  | "compile_match_brief"
  | "research_counterparty"
  | "summarise_call_notes"
  | "custom";

export type WorkspaceTaskOutputFormat =
  | "email_draft"
  | "brief"
  | "research"
  | "summary"
  | "note";

export const WORKSPACE_TASK_TYPES: WorkspaceTaskType[] = [
  "draft_intro_email",
  "compile_match_brief",
  "research_counterparty",
  "summarise_call_notes",
  "custom",
];

export const WORKSPACE_TASK_TYPE_LABELS: Record<WorkspaceTaskType, string> = {
  draft_intro_email: "Draft intro email",
  compile_match_brief: "Compile match brief",
  research_counterparty: "Research counterparty",
  summarise_call_notes: "Summarise call notes",
  custom: "Custom prompt",
};

export const WORKSPACE_TASK_TYPE_DESCRIPTIONS: Record<
  WorkspaceTaskType,
  string
> = {
  draft_intro_email:
    "Rex drafts a copy-pasteable intro email using both contact profiles and the match context.",
  compile_match_brief:
    "One-pager covering both sides, why this match, and open questions.",
  research_counterparty:
    "Short research note built from what we know about the counterparty.",
  summarise_call_notes:
    "Paste or describe the call; Rex extracts action items and sentiment.",
  custom:
    "Free-text prompt for anything that doesn't fit a template.",
};

/** Whether the task type demands a match_id to run. */
export const WORKSPACE_TASK_TYPE_REQUIRES_MATCH: Record<
  WorkspaceTaskType,
  boolean
> = {
  draft_intro_email: true,
  compile_match_brief: true,
  research_counterparty: false,
  summarise_call_notes: false,
  custom: false,
};

export type WorkspaceTaskMatchRef = {
  id: string;
  contactAName: string;
  contactBName: string;
};

export type WorkspaceTaskContactRef = {
  id: string;
  name: string;
};

export type WorkspaceTaskRow = {
  id: string;
  title: string;
  detail: string | null;
  status: WorkspaceTaskStatus;
  source: WorkspaceTaskSource;
  taskType: WorkspaceTaskType;
  prompt: string | null;
  output: string | null;
  outputFormat: WorkspaceTaskOutputFormat | null;
  error: string | null;
  matchId: string | null;
  match: WorkspaceTaskMatchRef | null;
  contactId: string | null;
  contact: WorkspaceTaskContactRef | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceTasksPageResult = {
  rows: WorkspaceTaskRow[];
  total: number;
};
