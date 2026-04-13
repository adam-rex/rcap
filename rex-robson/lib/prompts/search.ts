import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";
import { buildSurfacesSystemAddendum } from "./surfaces";
import type { RexAnthropicRequest } from "./types";

const SEARCH_TASK = `
The user initiated a workspace search. Interpret their query as search intent across contacts, organisations, deals, and notes (whatever tools or retrieval you are given). Prefer precise matches and short summaries; offer filters or refinements if the result set is large or ambiguous. Ask one clarifying question only if the query is empty or unusable.
`.trim();

export type BuildSearchSystemOptions = {
  /** Include empty-state / surface mirror text (default true). */
  includeSurfaces?: boolean;
  /** Optional RAG or SQL context appended after the main instructions. */
  retrievalContext?: string;
};

export function buildSearchSystemPrompt(
  options: BuildSearchSystemOptions = {},
): string {
  const { includeSurfaces = true, retrievalContext } = options;
  return joinPromptSections(
    REX_PERSONA_CORE,
    SEARCH_TASK,
    includeSurfaces ? buildSurfacesSystemAddendum() : false,
    retrievalContext,
  );
}

/**
 * Wraps raw search box input for the user message to Anthropic.
 */
export function buildSearchUserContent(rawQuery: string): string {
  const q = rawQuery.trim();
  return `The user ran a workspace search.

Query:
"""
${q}
"""`;
}

export function buildSearchAnthropicRequest(
  rawQuery: string,
  options?: BuildSearchSystemOptions,
): RexAnthropicRequest {
  return {
    system: buildSearchSystemPrompt(options),
    messages: [{ role: "user", content: buildSearchUserContent(rawQuery) }],
  };
}
