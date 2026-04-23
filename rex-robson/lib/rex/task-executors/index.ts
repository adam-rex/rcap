import type { WorkspaceTaskType } from "@/lib/data/workspace-tasks.types";
import { customExecutor } from "./custom";
import { introEmailExecutor } from "./intro-email";
import { matchBriefExecutor } from "./match-brief";
import { researchCounterpartyExecutor } from "./research-counterparty";
import { summariseCallNotesExecutor } from "./summarise-call-notes";
import type { TaskExecutor } from "./types";

export {
  TaskExecutorMissingContextError,
  type TaskExecutor,
  type TaskExecutorContext,
  type TaskExecutorResult,
} from "./types";

const REGISTRY: Record<WorkspaceTaskType, TaskExecutor> = {
  draft_intro_email: introEmailExecutor,
  compile_match_brief: matchBriefExecutor,
  research_counterparty: researchCounterpartyExecutor,
  summarise_call_notes: summariseCallNotesExecutor,
  custom: customExecutor,
};

export function getTaskExecutor(type: WorkspaceTaskType): TaskExecutor {
  const exec = REGISTRY[type];
  if (!exec) {
    throw new Error(`No executor registered for task type '${type}'`);
  }
  return exec;
}
