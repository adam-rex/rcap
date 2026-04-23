"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";
import {
  WORKSPACE_TASK_TYPE_LABELS,
  type WorkspaceTaskRow,
  type WorkspaceTaskStatus,
} from "@/lib/data/workspace-tasks.types";

export const STATUS_PILL: Record<WorkspaceTaskStatus, string> = {
  pending: "border-charcoal/15 bg-cream text-charcoal-light",
  running:
    "border-charcoal/25 bg-charcoal/10 text-charcoal animate-pulse",
  done: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  dismissed: "border-charcoal/10 bg-charcoal/[0.03] text-charcoal-light/70",
  failed: "border-red-700/30 bg-red-700/10 text-red-800",
};

export const STATUS_LABEL: Record<WorkspaceTaskStatus, string> = {
  pending: "Queued",
  running: "Running",
  done: "Done",
  dismissed: "Dismissed",
  failed: "Failed",
};

export function TaskStatusPill({ status }: { status: WorkspaceTaskStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_PILL[status]}`}
    >
      {status === "running" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Shared drawer used by both the inline per-match strip and the cross-match
 * Tasks queue. Keeps the artefact view, copy, and re-run wiring in one place.
 */
export function TaskDrawer({
  task,
  onClose,
  onRerun,
  onDismiss,
}: {
  task: WorkspaceTaskRow;
  onClose: () => void;
  onRerun: () => void;
  onDismiss?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canCopy = task.output != null && task.output.length > 0;

  return (
    <WorkspaceCreateDialog open title={task.title} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusPill status={task.status} />
          <span className="rounded-md border border-charcoal/15 bg-cream px-2 py-0.5 text-[10px] text-charcoal-light">
            {WORKSPACE_TASK_TYPE_LABELS[task.taskType]}
          </span>
          {task.match ? (
            <span className="truncate rounded-md border border-charcoal/10 bg-cream-light/70 px-2 py-0.5 text-[10px] text-charcoal-light">
              Match · {task.match.contactAName} ↔ {task.match.contactBName}
            </span>
          ) : null}
        </div>

        {task.prompt ? (
          <div>
            <p className={WORKSPACE_FORM_LABEL_CLASS}>Prompt</p>
            <div className="whitespace-pre-wrap rounded-lg border border-charcoal/10 bg-cream-light/60 p-2 text-xs text-charcoal-light">
              {task.prompt}
            </div>
          </div>
        ) : null}

        {task.error ? (
          <div>
            <p className={WORKSPACE_FORM_LABEL_CLASS}>Error</p>
            <div className="whitespace-pre-wrap rounded-lg border border-red-700/20 bg-red-700/5 p-2 text-xs text-red-800">
              {task.error}
            </div>
          </div>
        ) : null}

        <div>
          <p className={WORKSPACE_FORM_LABEL_CLASS}>Output</p>
          {task.output ? (
            <div className="whitespace-pre-wrap rounded-lg border border-charcoal/10 bg-cream p-3 text-sm text-charcoal">
              {task.output}
            </div>
          ) : task.status === "running" ? (
            <p className="text-xs text-charcoal-light">
              Rex is still working on this…
            </p>
          ) : (
            <p className="text-xs text-charcoal-light">
              No output yet. Run the task to generate one.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {canCopy ? (
            <button
              type="button"
              onClick={async () => {
                if (!task.output) return;
                try {
                  await navigator.clipboard.writeText(task.output);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                } catch {
                  // Clipboard permission refused; no-op.
                }
              }}
              className={WORKSPACE_FORM_BTN_SECONDARY}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {onDismiss && task.status !== "dismissed" ? (
            <button
              type="button"
              onClick={onDismiss}
              className={WORKSPACE_FORM_BTN_SECONDARY}
            >
              Dismiss
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRerun}
            disabled={task.status === "running"}
            className={WORKSPACE_FORM_BTN_SECONDARY}
          >
            {task.status === "failed" ? "Retry" : "Re-run"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={WORKSPACE_FORM_BTN_PRIMARY}
          >
            Close
          </button>
        </div>
      </div>
    </WorkspaceCreateDialog>
  );
}
