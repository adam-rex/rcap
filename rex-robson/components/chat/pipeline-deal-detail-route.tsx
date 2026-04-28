"use client";

import { ArrowLeft, ListTodo, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { HOME_PIPELINE_HREF } from "@/components/chat/chat-nav-config";
import {
  type MatchKind,
  type MatchOutcome,
  type PipelineInternalComment,
  type PipelineInternalTodo,
  type PipelineTransactionStage,
  type WorkspacePipelineTransactionRow,
} from "@/lib/data/workspace-matches-page.types";
import { MatchRexTasks } from "./match-rex-tasks";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
} from "./workspace-create-dialog";

const STAGES: {
  id: PipelineTransactionStage;
  label: string;
  description: string;
}[] = [
  {
    id: "active",
    label: "Active",
    description: "Specific deal in motion for this introduction",
  },
  {
    id: "closed",
    label: "Closed",
    description: "Outcome recorded — won, lost, or passed",
  },
];

const KINDS: { id: MatchKind; label: string }[] = [
  { id: "founder_investor", label: "Founder · Investor" },
  { id: "founder_lender", label: "Founder · Lender" },
];

const OUTCOMES: { id: MatchOutcome; label: string }[] = [
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "passed", label: "Passed" },
];

const OUTCOME_PILL: Record<MatchOutcome, string> = {
  won: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  lost: "border-red-700/30 bg-red-700/10 text-red-800",
  passed: "border-charcoal/15 bg-charcoal/5 text-charcoal-light",
};

const KIND_BADGE: Record<MatchKind, string> = {
  founder_investor: "border-charcoal/15 bg-charcoal/5 text-charcoal",
  founder_lender: "border-charcoal/20 bg-charcoal/10 text-charcoal",
};

function kindLabel(kind: MatchKind) {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

function outcomeLabel(outcome: MatchOutcome | null) {
  if (!outcome) return null;
  return OUTCOMES.find((o) => o.id === outcome)?.label ?? outcome;
}

function formatDealWorkspaceTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type ApiErr = { error?: string; hint?: string };

export function PipelineDealDetailRoute({ dealId }: { dealId: string }) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<WorkspacePipelineTransactionRow | null>(
    null,
  );

  const [fTitle, setFTitle] = useState("");
  const [fStage, setFStage] = useState<PipelineTransactionStage>("active");
  const [fOutcome, setFOutcome] = useState<MatchOutcome | "">("");
  const [fContext, setFContext] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fKind, setFKind] = useState<MatchKind>("founder_investor");
  const [pairHeadline, setPairHeadline] = useState("");
  const [fInternalComments, setFInternalComments] = useState<
    PipelineInternalComment[]
  >([]);
  const [fInternalTodos, setFInternalTodos] = useState<PipelineInternalTodo[]>(
    [],
  );
  const [fTeamCommentDraft, setFTeamCommentDraft] = useState("");
  const [fTeamTodoDraft, setFTeamTodoDraft] = useState("");

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stageMoveBusy, setStageMoveBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/workspace/match-transactions/${dealId}`);
      const data = (await res.json()) as WorkspacePipelineTransactionRow &
        ApiErr;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setDeal(null);
        setLoadError(parts.length > 0 ? parts.join(" ") : "Could not load deal.");
        return;
      }
      setDeal(data);
      setPairHeadline(`${data.contact_a_name} ↔ ${data.contact_b_name}`);
      setFKind(data.kind);
      setFStage(data.stage);
      setFOutcome(data.outcome ?? "");
      setFContext(data.context ?? "");
      setFNotes(data.notes ?? "");
      setFTitle(data.title ?? "");
      setFInternalComments(data.internal_comments ?? []);
      setFInternalTodos(data.internal_todos ?? []);
    } catch {
      setDeal(null);
      setLoadError("Network error while loading deal.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (fStage === "closed" && !fOutcome) {
      setSaveError("Pick an outcome to close this deal.");
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/workspace/match-transactions/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fTitle.trim() === "" ? null : fTitle.trim(),
          stage: fStage,
          outcome: fStage === "closed" ? fOutcome || null : null,
          context: fContext.trim() === "" ? null : fContext.trim(),
          notes: fNotes.trim() === "" ? null : fNotes.trim(),
          internalComments: fInternalComments,
          internalTodos: fInternalTodos,
        }),
      });
      const data = (await res.json()) as ApiErr;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setSaveError(parts.length > 0 ? parts.join(" ") : "Could not save.");
        return;
      }
      setReloadTick((n) => n + 1);
    } catch {
      setSaveError("Network error while saving.");
    } finally {
      setSaveBusy(false);
    }
  };

  const moveStage = async (toStage: PipelineTransactionStage) => {
    if (!deal) return;
    if (toStage === "closed" && !fOutcome && deal.stage !== "closed") {
      setFStage("closed");
      setSaveError("Pick an outcome below, then click Save changes.");
      return;
    }
    const outcome = toStage === "closed" ? fOutcome || deal.outcome : null;
    if (toStage === "closed" && !outcome) {
      setSaveError("Pick an outcome to move this deal to Closed.");
      return;
    }
    setStageMoveBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/workspace/match-transactions/${dealId}/stage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: toStage, outcome: outcome || null }),
        },
      );
      const data = (await res.json()) as ApiErr;
      if (!res.ok) {
        setSaveError(data.error ?? "Could not move deal stage.");
        return;
      }
      setReloadTick((n) => n + 1);
    } catch {
      setSaveError("Network error while moving deal stage.");
    } finally {
      setStageMoveBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-cream px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-charcoal/10" />
          <div className="h-40 rounded-lg bg-charcoal/5" />
        </div>
      </div>
    );
  }

  if (loadError != null || deal == null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-6">
        <p className="text-center text-sm text-red-700/90">{loadError}</p>
        <Link
          href={HOME_PIPELINE_HREF}
          className="rounded-lg border border-charcoal/15 bg-cream px-4 py-2 text-xs font-medium text-charcoal"
        >
          Back to pipeline
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream">
      <header className="sticky top-0 z-10 border-b border-charcoal/[0.06] bg-cream/95 px-4 py-3 backdrop-blur-sm sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <Link
            href={HOME_PIPELINE_HREF}
            className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/12 bg-cream px-2.5 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/[0.04]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Pipeline
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-lg tracking-tight text-charcoal sm:text-xl">
              {pairHeadline}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_BADGE[fKind]}`}
              >
                {kindLabel(fKind)}
              </span>
              {deal.stage === "closed" && deal.outcome ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${OUTCOME_PILL[deal.outcome]}`}
                >
                  {outcomeLabel(deal.outcome)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <MatchRexTasks matchId={deal.match_id} />

        <form onSubmit={onSave} className="mt-8 space-y-6">
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
              Quick stage
            </p>
            {STAGES.filter((s) => s.id !== deal.stage).map((target) => (
              <button
                key={target.id}
                type="button"
                disabled={stageMoveBusy || saveBusy}
                onClick={() => void moveStage(target.id)}
                className="rounded-lg border border-charcoal/15 px-3 py-1.5 text-xs text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
              >
                Move to {target.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="deal-detail-title"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Deal label (optional)
            </label>
            <input
              id="deal-detail-title"
              type="text"
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="e.g. Series A, venture debt"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="deal-detail-stage"
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                Stage
              </label>
              <select
                id="deal-detail-stage"
                value={fStage}
                onChange={(e) => {
                  const next = e.target.value as PipelineTransactionStage;
                  setFStage(next);
                  if (next !== "closed") setFOutcome("");
                }}
                className={WORKSPACE_FORM_INPUT_CLASS}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="deal-detail-outcome"
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                Outcome {fStage === "closed" ? "*" : "(closed only)"}
              </label>
              <select
                id="deal-detail-outcome"
                value={fOutcome}
                disabled={fStage !== "closed"}
                onChange={(e) =>
                  setFOutcome(e.target.value as MatchOutcome | "")
                }
                className={WORKSPACE_FORM_INPUT_CLASS}
              >
                <option value="">— pick outcome —</option>
                {OUTCOMES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="deal-detail-context"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Context
            </label>
            <textarea
              id="deal-detail-context"
              value={fContext}
              onChange={(e) => setFContext(e.target.value)}
              rows={10}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y min-h-[200px]`}
              placeholder="What is this specific transaction about?"
            />
          </div>

          <div>
            <label
              htmlFor="deal-detail-notes"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Notes
            </label>
            <textarea
              id="deal-detail-notes"
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              rows={8}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y min-h-[160px]`}
              placeholder="Internal-only notes."
            />
          </div>

          <section className="rounded-xl border border-charcoal/10 bg-cream-light/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-charcoal">
              <MessageSquare className="size-4 opacity-70" aria-hidden />
              <h2 className="text-sm font-semibold text-charcoal">
                Team workspace
              </h2>
            </div>
            <p className="mt-1 text-xs text-charcoal-light/80">
              Comments and to-dos stay internal — they are not Rex tasks.
            </p>

            <div className="mt-5">
              <p className={WORKSPACE_FORM_LABEL_CLASS}>Comments</p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-charcoal/10 bg-cream p-3">
                {[...fInternalComments].reverse().map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-charcoal/8 bg-cream-light/40 px-3 py-2 text-sm text-charcoal"
                  >
                    <p className="whitespace-pre-wrap">{c.body}</p>
                    <p className="mt-1 text-[11px] text-charcoal-light/70">
                      {formatDealWorkspaceTimestamp(c.created_at)}
                    </p>
                  </div>
                ))}
                {fInternalComments.length === 0 ? (
                  <p className="text-sm text-charcoal-light/70">
                    No comments yet.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={fTeamCommentDraft}
                  onChange={(e) => setFTeamCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = fTeamCommentDraft.trim();
                    if (!t) return;
                    setFInternalComments((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    setFTeamCommentDraft("");
                  }}
                />
                <button
                  type="button"
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                  onClick={() => {
                    const t = fTeamCommentDraft.trim();
                    if (!t) return;
                    setFInternalComments((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    setFTeamCommentDraft("");
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-8">
              <p className={`${WORKSPACE_FORM_LABEL_CLASS} flex items-center gap-1.5`}>
                <ListTodo className="size-3.5" aria-hidden />
                Internal to-dos
              </p>
              <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-charcoal/10 bg-cream p-3">
                {fInternalTodos.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-3 text-sm text-charcoal"
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() =>
                        setFInternalTodos((prev) =>
                          prev.map((x) =>
                            x.id === t.id ? { ...x, done: !x.done } : x,
                          ),
                        )
                      }
                      className="mt-1 rounded border-charcoal/25"
                    />
                    <span
                      className={
                        t.done
                          ? "text-charcoal-light line-through"
                          : undefined
                      }
                    >
                      {t.body}
                    </span>
                  </li>
                ))}
                {fInternalTodos.length === 0 ? (
                  <li className="text-sm text-charcoal-light/70">
                    No to-dos yet.
                  </li>
                ) : null}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={fTeamTodoDraft}
                  onChange={(e) => setFTeamTodoDraft(e.target.value)}
                  placeholder="Add a to-do…"
                  className={WORKSPACE_FORM_INPUT_CLASS}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = fTeamTodoDraft.trim();
                    if (!t) return;
                    setFInternalTodos((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        done: false,
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    setFTeamTodoDraft("");
                  }}
                />
                <button
                  type="button"
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                  onClick={() => {
                    const t = fTeamTodoDraft.trim();
                    if (!t) return;
                    setFInternalTodos((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        body: t,
                        done: false,
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    setFTeamTodoDraft("");
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </section>

          {saveError ? (
            <p className="text-sm text-red-700/90" role="alert">
              {saveError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-charcoal/8 pt-6">
            <Link
              href={HOME_PIPELINE_HREF}
              className={`${WORKSPACE_FORM_BTN_SECONDARY} inline-flex items-center justify-center`}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saveBusy || stageMoveBusy}
              className={WORKSPACE_FORM_BTN_PRIMARY}
            >
              {saveBusy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
