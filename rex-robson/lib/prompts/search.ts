import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";
import { buildSurfacesSystemAddendum } from "./surfaces";
import type { RexAnthropicRequest } from "./types";

/** Legacy single-pass search (retrieval injected into system). Prefer tools + reconciliation in API. */
const SEARCH_TASK = `
The user initiated a workspace search. Fixed database lookups produced the block titled "Deterministic workspace retrieval" in your instructions when present. Treat that block as the source of truth for what exists under that scan.

Summarize what matched in Rex's voice; if nothing matched, say so and suggest sharper keywords. Do not invent records not listed there.

If the result set is large or fuzzy, offer one concrete way to narrow the next search (e.g. sector, geography, match stage).
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
