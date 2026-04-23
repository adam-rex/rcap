import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";
import {
  TaskExecutorMissingContextError,
  type TaskExecutor,
  type TaskExecutorContext,
} from "./types";
import { fetchMatchContext, renderMatchSummary } from "./match-context";

const SYSTEM_PROMPT = `You are Rex, drafting a warm, professional intro email on behalf of a boutique deal team.
The sender is a partner at the deal team introducing two counterparties on a match.
Produce an email the sender can review, lightly edit, and send.

Rules:
- British English, plain prose, no marketing fluff, no emoji.
- Address both recipients in the greeting (by first names).
- In the body: one line on why the team is making the intro, two or three lines on why these
  two should talk (sector, deal type, cheque / size fit, geography, any shared context),
  and a clear, lightweight ask ("happy to leave you two to it").
- Sign off as "— The Robson Capital team" unless the user prompt says otherwise.
- Do not invent names, phone numbers, amounts, fund sizes, or cheque sizes. Only use what's
  in the match context.
- Output only the email. Use this format exactly:

Subject: <short subject>

<greeting>

<body>

<sign-off>`;

async function run(ctx: TaskExecutorContext) {
  const { supabase, task } = ctx;
  if (!task.matchId) {
    throw new TaskExecutorMissingContextError(
      "draft_intro_email requires a match_id.",
    );
  }
  const match = await fetchMatchContext(supabase, task.matchId);
  if (!match) {
    throw new TaskExecutorMissingContextError(
      `Match ${task.matchId} not found or already deleted.`,
    );
  }
  const extra = task.prompt?.trim()
    ? `\n\nExtra guidance from the user:\n${task.prompt.trim()}`
    : "";
  const userContent = `Draft the intro email for this match.\n\n${renderMatchSummary(match)}${extra}`;

  const text = await completeAnthropicMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 1200,
  });

  return { text, format: "email_draft" as const };
}

export const introEmailExecutor: TaskExecutor = {
  type: "draft_intro_email",
  defaultTitle: () => "Draft intro email",
  run,
};
