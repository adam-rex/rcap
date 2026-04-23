import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";
import { buildSurfacesSystemAddendum } from "./surfaces";

const SEARCH_TOOLS_TASK = `
The user is searching their workspace. You have tools to query contacts, organisations, intro matches (pairs of contacts on the canvas), and pending suggestions. Each tool runs a substring search (ILIKE) on fixed columns — you choose the search_term and may call tools multiple times with different terms or tables (e.g. sector names, company tokens, person names).

Do not invent rows: only state what appears in tool JSON results. If results are empty, say so in Rex's voice and suggest sharper keywords or another angle.

Formatting:
- When listing entities (contacts, organisations, matches, suggestions), use **bulleted lists** — one entity per line.
- For contacts, prefer: \`- **Name** — contact_type, sector, geography\` (omit missing fields).
- For matches, prefer: \`- **Contact A ↔ Contact B** — stage, kind, outcome\` (omit missing fields).
- Avoid long pipe-separated rows.

When you have enough signal from tools, answer the user concisely. Prefer calling tools first rather than guessing.
`.trim();

export function buildSearchToolsSystemPrompt(
  options: { includeSurfaces?: boolean } = {},
): string {
  const { includeSurfaces = true } = options;
  return joinPromptSections(
    REX_PERSONA_CORE,
    SEARCH_TOOLS_TASK,
    includeSurfaces ? buildSurfacesSystemAddendum() : false,
  );
}
