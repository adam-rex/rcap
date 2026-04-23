import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";
import {
  TaskExecutorMissingContextError,
  type TaskExecutor,
  type TaskExecutorContext,
} from "./types";
import { fetchMatchContext, renderMatchSummary } from "./match-context";

const SYSTEM_PROMPT = `You are Rex, an M&A / venture analyst assistant for a boutique deal team.
You write tight, executive-ready match briefs. Use British English, prefer GBP figures,
and stay factual — only claim what the data supports. Never invent contacts, amounts,
or quotes. Output Markdown with the exact section headings below.

Sections (in order):
## Overview
One paragraph: who are the two parties, what's the thesis of the match, what stage is it in.

## Founder snapshot
Tight bullets on the founder side (sector, stage, deal types, cheque need, geography, warmth).

## Capital snapshot
Tight bullets on the investor/lender side (mandate, cheque size, sectors, geography, warmth).

## Why this match
3–5 bullets linking sector, deal type, cheque/size fit, geography, and any shared context.

## Open questions
3–5 bullets the team should get answered before the next conversation.

Keep the whole brief under 400 words.`;

async function run(ctx: TaskExecutorContext) {
  const { supabase, task } = ctx;
  if (!task.matchId) {
    throw new TaskExecutorMissingContextError(
      "compile_match_brief requires a match_id.",
    );
  }
  const match = await fetchMatchContext(supabase, task.matchId);
  if (!match) {
    throw new TaskExecutorMissingContextError(
      `Match ${task.matchId} not found or already deleted.`,
    );
  }
  const extra = task.prompt?.trim() ? `\n\nExtra brief from the user:\n${task.prompt.trim()}` : "";
  const userContent =
    `Write a match brief for the pair below.\n\n${renderMatchSummary(match)}${extra}`;

  const text = await completeAnthropicMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 1200,
  });

  return { text, format: "brief" as const };
}

export const matchBriefExecutor: TaskExecutor = {
  type: "compile_match_brief",
  defaultTitle: () => "Compile match brief",
  run,
};
