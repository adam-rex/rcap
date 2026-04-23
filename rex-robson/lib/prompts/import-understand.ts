import { joinPromptSections } from "./compose";
import { FILE_IMPORT_SURFACE_SYSTEM } from "./file-import";
import { REX_PERSONA_CORE } from "./persona";

/**
 * One-turn classification for uploaded file snippets (CSV, notes, etc.).
 * Model returns strict JSON for the import Review step.
 */
export function buildImportUnderstandSystemPrompt(): string {
  return joinPromptSections(
    REX_PERSONA_CORE,
    FILE_IMPORT_SURFACE_SYSTEM,
    `
You are classifying an uploaded file so the product can reassure the user you understood it.

Reply with a single JSON object only (no markdown fences, no commentary). Keys:
- "understanding": string, one short sentence in first person as Rex, warm and confident. Start with something like "Got your" or "This looks like" — examples: "Got your meeting notes — I'll pull contacts and follow-ups.", "This is a contact list — I'll map people and firms.", "Got your lender criteria sheet — I'll line it up with founders on your list."
- "content_kind": one of "contact_list" | "meeting_notes" | "lender_criteria" | "mixed" | "unclear"
- "subtitle": optional string, max ~80 chars, factual (e.g. "47 rows · mostly people and companies")

Use the filename and the text sample. If the sample is too thin to tell, set content_kind to "unclear" and still give a cautious understanding that mentions the filename.
`.trim(),
  );
}

export function buildImportUnderstandUserContent(params: {
  filename: string;
  sampleText: string;
}): string {
  const sample = params.sampleText.trim();
  return `Filename: ${params.filename}

First lines / sample (may be truncated):
"""
${sample.slice(0, 12000)}
"""
`.trim();
}
