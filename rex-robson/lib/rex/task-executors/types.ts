import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WorkspaceTaskOutputFormat,
  WorkspaceTaskRow,
  WorkspaceTaskType,
} from "@/lib/data/workspace-tasks.types";

/**
 * Everything an executor needs to assemble its prompt and write its result.
 * Executors receive the DB client so they can pull extra context (match notes,
 * contact deal sizes, organisation name, etc.) without relying on whatever the
 * UI happened to send.
 */
export type TaskExecutorContext = {
  supabase: SupabaseClient;
  task: WorkspaceTaskRow;
};

export type TaskExecutorResult = {
  text: string;
  format: WorkspaceTaskOutputFormat;
};

export type TaskExecutor = {
  type: WorkspaceTaskType;
  /** Human label for the default task title when the user doesn't provide one. */
  defaultTitle: (ctx: TaskExecutorContext) => string;
  run: (ctx: TaskExecutorContext) => Promise<TaskExecutorResult>;
};

/** Raised when the DB lookup produces too little context to run. */
export class TaskExecutorMissingContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskExecutorMissingContextError";
  }
}
