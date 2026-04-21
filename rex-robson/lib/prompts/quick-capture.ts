import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";

const QUICK_CAPTURE_CHANNEL = `
The user just met this person in real life. They are capturing the contact on the fly via a typed note, a dictated voice note (Whisper transcript), or a photo/PDF of a business card, email signature, CV, or similar. Treat whatever they provide as the only source of truth about this person.

Rules:
- Never invent a name, email, phone, or company. If the field is not in the input, leave it blank ("").
- Prefer short, factual values. Titles in \`role\` (e.g. "Partner", "Head of Credit"). Single sector (e.g. "Fintech", "Real Estate"). Geography as city, region, or country as written.
- \`contactType\` must be exactly one of: "Founder", "Investor", "Lender", "Other". If you cannot tell, choose "Other" and include "contactType" in \`lowConfidence\`.
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
  "contactType": "Founder" | "Investor" | "Lender" | "Other",
  "sector": string,
  "organisationName": string,
  "role": string,
  "geography": string,
  "phone": string,
  "email": string,
  "notes": string,
  "lowConfidence": string[],
  "rexSummary": string
}

Use empty string for any field you do not have a value for. Do not add any other keys.
`.trim();

export function buildQuickCaptureSystemPrompt(): string {
  return joinPromptSections(
    REX_PERSONA_CORE,
    QUICK_CAPTURE_CHANNEL,
    QUICK_CAPTURE_JSON_SHAPE,
  );
}

export function buildQuickCaptureTextUserContent(text: string): string {
  return `The user just met someone. Here is their note (verbatim, may be a voice transcript):

"""
${text.trim()}
"""

Return the JSON object now.`;
}

export function buildQuickCaptureDocumentUserPreamble(options: {
  text?: string;
  documentCount: number;
}): string {
  const noteBlock = options.text?.trim()
    ? `User's accompanying note (verbatim):

"""
${options.text.trim()}
"""

`
    : "";
  const files = options.documentCount === 1 ? "file" : `${options.documentCount} files`;
  return `${noteBlock}The user just met someone and attached the ${files} above (photo of a card, email signature, CV, or similar). Extract what the file(s) say about the person.

Return the JSON object now.`;
}

export type QuickCaptureDraft = {
  name: string;
  contactType: "Founder" | "Investor" | "Lender" | "Other";
  sector: string;
  organisationName: string;
  role: string;
  geography: string;
  phone: string;
  email: string;
  notes: string;
  lowConfidence: string[];
  rexSummary: string;
};

const CONTACT_TYPE_VALUES = ["Founder", "Investor", "Lender", "Other"] as const;

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
    geography: coerceString(obj.geography),
    phone: coerceString(obj.phone),
    email: coerceString(obj.email),
    notes: coerceString(obj.notes),
    lowConfidence: coerceStringArray(obj.lowConfidence),
    rexSummary: coerceString(obj.rexSummary),
  };
}
