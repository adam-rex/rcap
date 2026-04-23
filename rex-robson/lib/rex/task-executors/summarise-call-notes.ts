import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";
import {
  TaskExecutorMissingContextError,
  type TaskExecutor,
  type TaskExecutorContext,
} from "./types";
import { fetchMatchContext, renderMatchSummary } from "./match-context";

const SYSTEM_PROMPT = `You are Rex, summarising call notes for a boutique deal team.
The user pastes raw transcript or bullet notes as their prompt. Turn that into a clean,
skim-friendly summary a partner can catch up on in 30 seconds.

Output Markdown with the following sections:
## TL;DR
Two-line summary of what happened and where it leaves the match.

## Key points
5–8 bullets capturing decisions, signals, objections, and numbers discussed.

## Action items
Bulleted list of owners + actions + rough timing. Use "— TBD" if the transcript doesn't
specify an owner. Do not invent names.

## Sentiment
One or two lines: warm / lukewarm / cold and why, based only on the transcript.

British English. Never fabricate attendees, dates, amounts, or quotes. If the prompt is
empty or clearly not a call note, say so briefly instead.`;

async function run(ctx: TaskExecutorContext) {
  const { supabase, task } = ctx;
  const userPrompt = task.prompt?.trim() ?? "";
  if (userPrompt.length === 0) {
    throw new TaskExecutorMissingContextError(
      "summarise_call_notes requires call notes in the prompt.",
    );
  }

  const pieces: string[] = [];
  if (task.matchId) {
    const match = await fetchMatchContext(supabase, task.matchId);
    if (match) {
      pieces.push(
        "Match this call relates to:\n" + renderMatchSummary(match),
      );
    }
  }
  pieces.push("Call notes / transcript from the user:\n" + userPrompt);

  const text = await completeAnthropicMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: pieces.join("\n\n---\n\n") }],
    maxTokens: 1400,
  });

  return { text, format: "summary" as const };
}

export const summariseCallNotesExecutor: TaskExecutor = {
  type: "summarise_call_notes",
  defaultTitle: () => "Summarise call notes",
  run,
};
