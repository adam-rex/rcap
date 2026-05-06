import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";

/**
 * Role / firm taxonomy for interpreting titles and employer context.
 * Matches the Corporate vs Advisor distinction in quick capture (large firms = Corporate).
 */
const CONTACT_ENRICH_TAXONOMY = `
Role and firm context (for interpreting titles and bios only — do NOT output or guess contact_type):
- Prefer short factual titles in \`role\` (e.g. "Partner", "Head of Credit").
- Corporate — anyone at an established/large firm (Big Four, major law firms, bulge-bracket banks for non-investing roles, MBB consultancies, multinationals), and non-deal operational roles. "Partner" at a large law/accounting/consulting firm → frame role/title factually at that firm (still Corporate context).
- Advisor — independent or small-boutique professional; solo or co-owned small practice.
- Investor / Lender / Founder distinctions matter for narrative in \`notes\` only if clearly stated in sources; never invent deal-making claims.
`.trim();

const CONTACT_ENRICH_CHANNEL = `
You enrich an existing workspace contact using ONLY the provided sources (fetched web page text and/or attached PDFs rendered below) plus the existing contact JSON for context.

Rules:
- Suggest updates only when a source clearly supports them. If you cannot justify a value from the sources, omit that field from \`suggestions\`.
- Never fabricate numbers, sectors, geographies, deal sizes, or deal types.
- Prefer concise values: single sector where possible; geography as written in sources; \`notes\` additions should be short factual supplements grounded in sources (do not wipe useful existing notes unless sources clearly supersede — when uncertain, omit \`notes\`).
- \`deal_types\` must be short labels clearly stated or unambiguous (e.g. "Venture debt", "Growth equity"). Omit if unclear.
- \`min_deal_size\` / \`max_deal_size\` are currency amounts in the same unit as the database expects (plain numbers; typically whole currency units as used in the app — use values exactly as stated in sources when possible). Omit if not explicit.
- Do not suggest changes to name, email, phone, or contact_type — those fields are out of scope.

Reply with a single JSON object only — no markdown fences, no commentary, no prose outside the object.
`.trim();

const CONTACT_ENRICH_JSON_SHAPE = `
The JSON object must use exactly these keys:

{
  "suggestions": {
    "sector"?: string,
    "deal_types"?: string[],
    "min_deal_size"?: number,
    "max_deal_size"?: number,
    "geography"?: string,
    "notes"?: string,
    "role"?: string
  },
  "reasoning": string
}

Only include keys inside \`suggestions\` when there is a real, source-backed suggestion. Omit unchanged or unsupported fields entirely. \`reasoning\` should briefly cite what you used from the sources (no chain-of-thought).
`.trim();

export function buildContactEnrichSystemPrompt(): string {
  return joinPromptSections(
    REX_PERSONA_CORE,
    CONTACT_ENRICH_TAXONOMY,
    CONTACT_ENRICH_CHANNEL,
    CONTACT_ENRICH_JSON_SHAPE,
  );
}

export type ContactEnrichContextContact = {
  name: string;
  contact_type: string | null;
  organisation_name: string | null;
  sector: string | null;
  role: string | null;
  geography: string | null;
  notes: string | null;
  deal_types: string[] | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  email: string | null;
  phone: string | null;
};

export function buildContactEnrichUserText(params: {
  contact: ContactEnrichContextContact;
  websiteExcerpt: string | null;
}): string {
  const contactJson = JSON.stringify(params.contact, null, 2);
  let out = `Existing contact (JSON; context only — do not suggest changes to name, email, phone, or contact_type):\n\n${contactJson}\n\n`;

  if (params.websiteExcerpt?.trim()) {
    out += `Fetched public web page text (plain text excerpt):\n\n"""\n${params.websiteExcerpt.trim()}\n"""\n\n`;
  }

  out +=
    params.websiteExcerpt?.trim()
      ? "The PDF attachments above (if any) are additional sources."
      : "Use only the PDF attachments above as documentary sources.";

  out += `\n\nReturn the JSON object now.`;
  return out;
}
