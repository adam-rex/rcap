import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";

const EMAIL_EXTRACT_CHANNEL = `
The user just forwarded (or attached) an email so Rex can capture the people, organisations, and asks inside it. Treat the email body, signatures, headers, and the From/To/Cc lines as the only source of truth.

Your job, in order:

1) **Identify the parties.** Walk the From, To, Cc, the body (especially closing signatures and "I'd like to introduce you to..." paragraphs). Each distinct real person becomes one \`contact\` extraction. Do not invent people who are not named. Skip mailing lists, no-reply addresses, calendar bots.

2) **Tie people to organisations.** If a person mentions or signs off for an organisation that you have not already captured as a separate \`organisation\` extraction, set \`organisationName\` on the contact. Only emit a standalone \`organisation\` extraction when the email is genuinely about a company itself (e.g. a fund deck, a fund launch announcement) rather than a person at it.

3) **Surface intro requests.** If the sender explicitly asks for a warm intro, an opinion on a counterparty, or a pairing between two parties, emit one \`intro_request\` extraction. Do not infer intros from generic "let me know if helpful".

4) **No fabrication.** If a field is not in the email, leave it as an empty string. Never guess phone numbers, sectors, or geographies. Use the \`lowConfidence\` field on each extraction to flag any value you inferred rather than read literally.

5) **Stay terse.** \`title\` is one short noun phrase ("Jane Doe — Founder, Acme"), \`summary\` is one sentence Rex would write to himself, \`detail\` is at most 2-3 lines.

If the email contains nothing extractable, return \`{ "extractions": [] }\`.

Reply with a single JSON object only — no markdown fences, no commentary, no prose outside the object.
`.trim();

const EMAIL_EXTRACT_JSON_SHAPE = `
The JSON object must have exactly this shape:

{
  "extractions": Extraction[]
}

Where Extraction is one of:

ContactExtraction = {
  "kind": "contact",
  "title": string,
  "summary": string,
  "detail": string,
  "payload": {
    "name": string,
    "email": string,
    "phone": string,
    "role": string,
    "geography": string,
    "sector": string,
    "contactType": "Founder" | "Investor" | "Lender" | "Advisor" | "Corporate" | "Other",
    "organisationName": string,
    "organisationType": string,
    "organisationDescription": string,
    "notes": string,
    "lowConfidence": string[]
  }
}

OrganisationExtraction = {
  "kind": "organisation",
  "title": string,
  "summary": string,
  "detail": string,
  "payload": {
    "name": string,
    "type": string,
    "description": string,
    "lowConfidence": string[]
  }
}

IntroRequestExtraction = {
  "kind": "intro_request",
  "title": string,
  "summary": string,
  "detail": string,
  "payload": {
    "title": string,
    "body": string,
    "context": string
  }
}

Rules:
- Use empty string ("") for any text field you cannot fill. Do NOT use null.
- Use [] for empty \`lowConfidence\`.
- \`payload.name\` (contact / organisation) is required and must be the real value. If you cannot find a name, do not emit that extraction.
- \`payload.contactType\` must be exactly one of the listed values. If unclear, choose "Other" and add "contactType" to \`lowConfidence\`.
- Do not include any keys other than the ones listed above.
`.trim();

export function buildEmailExtractSystemPrompt(): string {
  return joinPromptSections(
    REX_PERSONA_CORE,
    EMAIL_EXTRACT_CHANNEL,
    EMAIL_EXTRACT_JSON_SHAPE,
  );
}

export function buildEmailExtractUserContent(input: {
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
}): string {
  const fromLine = input.fromName
    ? `${input.fromName} <${input.fromAddress}>`
    : input.fromAddress;
  const toLine = input.toAddresses.length > 0 ? input.toAddresses.join(", ") : "(none)";
  const ccLine = input.ccAddresses.length > 0 ? input.ccAddresses.join(", ") : "(none)";
  const body =
    (input.bodyText && input.bodyText.trim()) ||
    stripHtml(input.bodyHtml) ||
    "(empty body)";

  return `An email was forwarded to Rex. Extract the people, organisations, and asks from it.

From: ${fromLine}
To: ${toLine}
Cc: ${ccLine}
Date: ${input.receivedAt}
Subject: ${input.subject || "(no subject)"}

Body (verbatim):
"""
${truncateForPrompt(body)}
"""

Return the JSON object now.`;
}

const PROMPT_BODY_LIMIT = 30_000;

function truncateForPrompt(s: string): string {
  if (s.length <= PROMPT_BODY_LIMIT) return s;
  return `${s.slice(0, PROMPT_BODY_LIMIT)}\n\n[...truncated for length...]`;
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
