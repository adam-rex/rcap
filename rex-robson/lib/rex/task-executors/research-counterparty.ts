import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";
import {
  TaskExecutorMissingContextError,
  type TaskExecutor,
  type TaskExecutorContext,
} from "./types";
import {
  fetchContactContext,
  fetchMatchContext,
  renderContactSummary,
  type ContactContext,
  type MatchContext,
} from "./match-context";

const SYSTEM_PROMPT = `You are Rex, a research analyst at a boutique deal team.
The user has asked for a short research note on a counterparty — someone on the other side
of a potential match. Work only from the structured context provided. Do NOT guess
figures, LinkedIn URLs, or quotes you don't have. If the data is thin, say so.

Output Markdown with the following sections:
## Snapshot
One paragraph: who they are, what they do, what they're focused on right now.

## What we know
Tight bullets pulled from the data (sector focus, cheque sizes, deal types, geography,
recent activity, warmth signals).

## Known gaps
3–5 bullets on what we still need before the next conversation.

## Suggested next steps
2–3 concrete actions the team could take.

Keep the whole note under 300 words.`;

function pickCounterparty(
  match: MatchContext,
  preferredContactId: string | null,
): ContactContext {
  if (preferredContactId) {
    if (match.contactA.id === preferredContactId) return match.contactA;
    if (match.contactB.id === preferredContactId) return match.contactB;
  }
  // Default: research the capital side (B). Our seeding uses founder = A, capital = B.
  return match.contactB;
}

async function run(ctx: TaskExecutorContext) {
  const { supabase, task } = ctx;

  let subject: ContactContext | null = null;

  if (task.matchId) {
    const match = await fetchMatchContext(supabase, task.matchId);
    if (!match) {
      throw new TaskExecutorMissingContextError(
        `Match ${task.matchId} not found or already deleted.`,
      );
    }
    subject = pickCounterparty(match, task.contactId);
  } else if (task.contactId) {
    subject = await fetchContactContext(supabase, task.contactId);
    if (!subject) {
      throw new TaskExecutorMissingContextError(
        `Contact ${task.contactId} not found.`,
      );
    }
  } else {
    throw new TaskExecutorMissingContextError(
      "research_counterparty requires a match_id or contact_id.",
    );
  }

  const extra = task.prompt?.trim()
    ? `\n\nExtra focus from the user:\n${task.prompt.trim()}`
    : "";

  const userContent =
    `Write a counterparty research note on the contact below.\n\n` +
    `${renderContactSummary(subject, null)}${extra}`;

  const text = await completeAnthropicMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 1000,
  });

  return { text, format: "research" as const };
}

export const researchCounterpartyExecutor: TaskExecutor = {
  type: "research_counterparty",
  defaultTitle: () => "Research counterparty",
  run,
};
