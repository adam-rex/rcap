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
  renderMatchSummary,
} from "./match-context";

const SYSTEM_PROMPT = `You are Rex, an analyst assistant for a boutique deal team.
You handle free-text tasks the partner has given you. Work only with the context provided
plus the user prompt. British English. If the user asks for something you cannot do with
the information available, say so briefly instead of guessing.

Output Markdown. Keep responses focused and skim-friendly. Avoid preambles like "Sure"
and sign-offs — jump straight to the answer.`;

async function run(ctx: TaskExecutorContext) {
  const { supabase, task } = ctx;
  const userPrompt = task.prompt?.trim() ?? "";
  if (userPrompt.length === 0) {
    throw new TaskExecutorMissingContextError(
      "Custom tasks require a non-empty prompt.",
    );
  }

  const contextLines: string[] = [];

  if (task.matchId) {
    const match = await fetchMatchContext(supabase, task.matchId);
    if (match) {
      contextLines.push("Match context:\n" + renderMatchSummary(match));
    }
  }

  if (!task.matchId && task.contactId) {
    const contact = await fetchContactContext(supabase, task.contactId);
    if (contact) {
      contextLines.push(
        "Contact context:\n" + renderContactSummary(contact, null),
      );
    }
  }

  const pieces: string[] = [];
  if (contextLines.length > 0) {
    pieces.push(contextLines.join("\n\n"));
  }
  pieces.push(`User prompt:\n${userPrompt}`);

  const text = await completeAnthropicMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: pieces.join("\n\n---\n\n") }],
    maxTokens: 1500,
  });

  return { text, format: "note" as const };
}

export const customExecutor: TaskExecutor = {
  type: "custom",
  defaultTitle: (ctx) => {
    const p = ctx.task.prompt?.trim() ?? "";
    if (!p) return "Custom Rex task";
    const first = p.split("\n")[0] ?? p;
    return first.length > 80 ? `${first.slice(0, 77)}…` : first;
  },
  run,
};
