import {
  isWorkspaceContactRoleSlug,
  type WorkspaceContactRoleSlug,
} from "@/lib/constants/contact-roles";
import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";

const QUICK_CAPTURE_CHANNEL = `
The user just met this person in real life. They are capturing the contact on the fly via a typed note, a dictated voice note (Whisper transcript), a photo/PDF of a business card, email signature, CV, or similar, and/or excerpts from public web pages they chose (about the person, their company, or a team bio page).

Sources of truth:
- Treat the user's note, any attached scans/PDFs, and any provided page excerpts as your only evidence about this person.
- When page excerpts are included, facts clearly stated in those excerpts are as authoritative as the user's note and attachments.
- Never invent a name, email, phone, or company that does not appear in any of these sources. If a field is not there, leave it blank ("").

Rules:
- Prefer short, factual values. Titles in \`role\` (e.g. "Partner", "Head of Credit"). Single sector (e.g. "Fintech", "Real Estate"). Geography as city, region, or country as written.
- \`contactType\` must be exactly one of: "Founder", "Investor", "Lender", "Advisor", "Corporate", "Other". Guidance:
  - "Founder" — currently builds/runs an operating company. Position is "Founder", "Co-founder", or "Founding [executive role]" (CEO/CTO/COO/CFO/President), OR is C-suite at a clear startup. NOT "Founding Engineer", "Founding Designer", or other early-employee titles (those are Corporate). NOT "Founding Partner" at a law/accounting/consulting firm (that's about firm-founding, not company-founding).
  - "Investor" — personally deploys equity capital into companies. VC partners/principals/associates, angels, family office principals, fund managers, LPs with discretion, growth equity, PE investment professionals. Must have decision authority over capital deployment.
  - "Lender" — personally provides debt/credit. Venture debt, private credit, asset finance specialists, lending desk professionals. NOT M&A bankers — those are Corporate.
  - "Advisor" — independent or small-boutique professional. Solo consultants, M&A boutiques, independent wealth advisors, small specialist firms (typically <20 people, often eponymous like "Smith & Co"). The defining feature is they founded or co-own the firm, not that they work at one.
  - "Corporate" — anyone employed at an established/large firm, regardless of whether the firm provides services or products. This includes:
    - Big Four accountants (Deloitte, PwC, EY, KPMG, BDO, Grant Thornton)
    - Magic circle and major law firms (Linklaters, Allen & Overy, Clifford Chance, Freshfields, Walkers, Mourant, Ogier, etc.)
    - Bulge bracket and major investment banks for non-investing roles (Goldman M&A, JPM IBD, Morgan Stanley advisory, Rothschild, Lazard, Houlihan Lokey, Evercore, etc.)
    - MBB and major consultancies (McKinsey, BCG, Bain, Oliver Wyman)
    - Multinational corporations (FTSE 100, Fortune 500, etc.)
    - Anyone in a non-deal-making operational role at any firm (sales, marketing, IR, ops, HR, engineering, product)
  - "Other" — students, retirees, journalists, government (non-policy), volunteers, anyone clearly not in business/finance.

  KEYWORD TRAPS — override surface keywords:
  - "Investment Lawyer" / "Investment Funds Lawyer" / "Private Equity Lawyer" → Corporate if at a named law firm; Advisor only if at a small/independent practice.
  - "Investor Relations" / "Head of IR" / "VP IR" → Corporate (communicates with investors, doesn't deploy capital).
  - "Investment Banker" / "M&A Banker" / "Coverage Banker" / "IBD" → Corporate (advises on transactions but works at large bank).
  - "Founding Engineer" / "Founding Designer" / "Founding [non-executive]" → Corporate (early employee, not founder).
  - "Founding Partner" at a law/accounting/consulting firm → Corporate (firm-founder, not company-founder).
  - "Partner" disambiguation: VC/PE/family office firm → Investor. Solo or small advisory firm → Advisor. Large law/accounting/consulting firm → Corporate. Operating company → Corporate.
  - "Managing Director" disambiguation: at a bank → Corporate (banking division). At a fund → Investor. At an operating company → Corporate.
  - "Director" with no firm context → Other with low confidence (genuinely too ambiguous).

  If you cannot tell, choose "Other" and include "contactType" in \`lowConfidence\`.

  Roles in Robson deals (\`roles\`) — multi-select, SEPARATE from \`contactType\`:
  - \`roles\` is an array of slugs from this fixed list (zero or more, no duplicates): "spv_investor", "borrower".
  - A contact can have both, one, or neither; default \`[]\` when nothing in the input implies SPV investing or borrowing.
  - \`spv_investor\` — the person personally puts money into our SPVs / vehicles, writes LP-style cheques, or wants to back the next deal. Triggers: "wants to invest in SPVs", "happy to back the next deal", "putting in £500k", "writes LP cheques", "interested in our SPVs", "co-investor on the last deal".
  - \`borrower\` — the contact (or the company they run/own) is borrowing money from us. Triggers: "looking for a £3M loan", "needs working capital", "raising debt for the business", "they want a bridge", "company is borrowing from us".
  - These are about behaviour on our deals, not their job. An Investor-type \`contactType\` can also be a \`borrower\` if their own business is borrowing; a Lender-type institution employee can be a personal \`spv_investor\` if they put money into our SPVs on the side.
  - If you guess a role from soft cues (rather than a literal phrase), include "roles" in \`lowConfidence\`.
- \`notes\` should preserve the user's raw context verbatim-ish (what they said about the person, where they met, what the person is looking for). Keep it short — a few lines at most.
- \`lowConfidence\` lists any field names you guessed or inferred vs. read literally. Empty array if everything was explicit.
- \`rexSummary\` is one short first-person sentence as Rex, warm and confident. Examples: "Got Jane from Acme — fintech founder raising a seed.", "That's Marcus at Bridgepoint — mid-market credit, UK focus.".

If the input is too thin to identify a person (no name anywhere), return \`name: ""\` and put "name" in \`lowConfidence\`; the UI will ask the user to fill it in.

Reply with a single JSON object only — no markdown fences, no commentary, no prose outside the object.
`.trim();

const QUICK_CAPTURE_JSON_SHAPE = `
The JSON object must use exactly these keys:

{
  "name": string,
  "contactType": "Founder" | "Investor" | "Lender" | "Advisor" | "Corporate" | "Other",
  "sector": string,
  "organisationName": string,
  "role": string,
  "roles": ("spv_investor" | "borrower")[],
  "geography": string,
  "phone": string,
  "email": string,
  "notes": string,
  "lowConfidence": string[],
  "rexSummary": string
}

Use empty string for any field you do not have a value for. Use \`[]\` for \`roles\` when no role applies. Do not add any other keys.
`.trim();

export function buildQuickCaptureSystemPrompt(): string {
  return joinPromptSections(
    REX_PERSONA_CORE,
    QUICK_CAPTURE_CHANNEL,
    QUICK_CAPTURE_JSON_SHAPE,
  );
}

export function buildQuickCaptureTextUserContent(
  text: string,
  options?: { fetchedPages?: string },
): string {
  const note = text.trim();
  const pages = options?.fetchedPages?.trim();
  let out = `The user just met someone. Here is their note (verbatim, may be a voice transcript; may be empty if they only supplied links):

"""
${note}
"""
`;
  if (pages) {
    out += `\n${pages}\n`;
  }
  out += `\nReturn the JSON object now.`;
  return out;
}

export function buildQuickCaptureDocumentUserPreamble(options: {
  text?: string;
  documentCount: number;
  fetchedPages?: string;
}): string {
  const noteBlock = options.text?.trim()
    ? `User's accompanying note (verbatim):

"""
${options.text.trim()}
"""

`
    : "";
  const files = options.documentCount === 1 ? "file" : `${options.documentCount} files`;
  const pages = options.fetchedPages?.trim();
  let out = `${noteBlock}The user just met someone and attached the ${files} above (photo of a card, email signature, CV, or similar). Extract what the file(s) say about the person.
`;
  if (pages) {
    out += `\n${pages}\n`;
  }
  out += `\nReturn the JSON object now.`;
  return out;
}

export type QuickCaptureDraft = {
  name: string;
  contactType: "Founder" | "Investor" | "Lender" | "Advisor" | "Corporate" | "Other";
  sector: string;
  organisationName: string;
  role: string;
  /** Multi-select role tags inferred from the note; subset of WORKSPACE_CONTACT_ROLE_SLUGS. */
  roles: WorkspaceContactRoleSlug[];
  geography: string;
  phone: string;
  email: string;
  notes: string;
  lowConfidence: string[];
  rexSummary: string;
};

const CONTACT_TYPE_VALUES = [
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
] as const;

function coerceString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function coerceContactType(value: unknown): QuickCaptureDraft["contactType"] {
  if (typeof value !== "string") return "Other";
  const hit = CONTACT_TYPE_VALUES.find(
    (v) => v.toLowerCase() === value.trim().toLowerCase(),
  );
  return hit ?? "Other";
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      out.push(item.trim());
    }
  }
  return out;
}

function coerceRoles(value: unknown): WorkspaceContactRoleSlug[] {
  if (!Array.isArray(value)) return [];
  const out: WorkspaceContactRoleSlug[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (t && isWorkspaceContactRoleSlug(t)) out.push(t);
  }
  return [...new Set(out)];
}

/**
 * Parse the raw LLM response into a strict `QuickCaptureDraft`. Accepts either
 * a bare JSON object or a payload wrapped in markdown fences / preamble.
 */
export function parseQuickCaptureDraft(raw: string): QuickCaptureDraft | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return {
    name: coerceString(obj.name),
    contactType: coerceContactType(obj.contactType),
    sector: coerceString(obj.sector),
    organisationName: coerceString(obj.organisationName),
    role: coerceString(obj.role),
    roles: coerceRoles(obj.roles),
    geography: coerceString(obj.geography),
    phone: coerceString(obj.phone),
    email: coerceString(obj.email),
    notes: coerceString(obj.notes),
    lowConfidence: coerceStringArray(obj.lowConfidence),
    rexSummary: coerceString(obj.rexSummary),
  };
}
