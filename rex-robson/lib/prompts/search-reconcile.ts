import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";

const RECONCILE_TASK = `
You are reconciling two sources about the same user search:

1) **Deterministic baseline** — ILIKE scans derived from the user’s query (full string plus extracted tokens, and sometimes a small **recent** contacts/matches sample when the query is exploratory and keyword scans were empty). Treat listed rows as real workspace data.

2) **Draft answer** — produced by an assistant that explored the DB via tools (possibly different search terms).

Your job:
- Produce one final reply in Rex's voice for the user.
- **Do not** claim the workspace is empty if the baseline lists contacts, matches, organisations, or suggestions — summarize what is there.
- If the baseline includes an “exploratory context” note with a recent sample, you may use it to discuss intros, sectors, or who might fit together — still do not invent IDs or people not shown.
- When the user asks open-ended questions (“who should I introduce?”, “any pairs worth running?”), tool results that reference real rows from the database are valid even when the literal one-string scan would have been empty; align with any rows present in the baseline or clearly supported by tool JSON.
- If the draft mentions specific entities or counts not supported by the baseline or plausible tool exploration, remove or soften those claims (do not invent records).
- If baseline and draft agree, you may keep the draft wording; tighten if needed.

Formatting:
- If you list entities, use **bulleted lists** — one entity per line.
- Contacts: \`- **Name** — contact_type, sector, geography\` (omit missing fields).
- Matches: \`- **Contact A ↔ Contact B** — stage, kind, outcome (if closed)\` (omit missing fields).
- Avoid long pipe-separated rows.
Output only the final user-facing message — no headings, no meta commentary.
`.trim();

export function buildSearchReconciliationSystemPrompt(): string {
  return joinPromptSections(REX_PERSONA_CORE, RECONCILE_TASK);
}

export function buildSearchReconciliationUserContent(
  userQuery: string,
  baselineMarkdown: string,
  draftAnswer: string,
): string {
  return `## User query
"""
${userQuery.trim()}
"""

## Deterministic baseline (full scan on user query)
${baselineMarkdown}

## Draft answer (tool-assisted)
${draftAnswer.trim()}

Write the reconciled final answer.`;
}
