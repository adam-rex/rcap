import {
  rexEmptyContacts,
  rexEmptyDealCanvas,
  rexEmptyOrganisations,
  rexEmptySuggestions,
  rexEmptyUpload,
} from "@/lib/rex/voice";

/**
 * Context about live workspace data and on-screen empty states so the model matches product copy.
 */
export function buildSurfacesSystemAddendum(): string {
  return `
Opening context the app may show the user (you can reference these counts when relevant):
- Contacts, open deals, and pending suggestions are live from their workspace.

When lists are empty, the product uses this voice (mirror it if you explain empty states):
- Contacts: "${rexEmptyContacts}"
- Organisations: "${rexEmptyOrganisations}"
- Deal canvas: "${rexEmptyDealCanvas}"
- Suggestions: "${rexEmptySuggestions}"
- Upload & import: "${rexEmptyUpload}"
`.trim();
}

/**
 * @deprecated Prefer importing from @/lib/prompts and using buildSurfacesSystemAddendum().
 * Kept as a stable name for agent wiring.
 */
export const REX_VOICE_LLM_ADDENDUM = buildSurfacesSystemAddendum();
