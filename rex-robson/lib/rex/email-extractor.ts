import {
  buildEmailExtractSystemPrompt,
  buildEmailExtractUserContent,
} from "@/lib/prompts/email-extract";
import type { RexEmailExtractionKind } from "@/lib/data/workspace-emails.types";
import { completeAnthropicMessage } from "./anthropic-messages";

export type ExtractedRow = {
  kind: RexEmailExtractionKind;
  title: string;
  summary: string;
  detail: string;
  payload: Record<string, unknown>;
};

export type ExtractEmailInput = {
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
};

const ALLOWED_CONTACT_TYPES = new Set([
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
]);

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asObj(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function clipString(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "\u2026";
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normaliseContact(raw: Record<string, unknown>): ExtractedRow | null {
  const payload = asObj(raw.payload);
  const name = asStr(payload.name);
  if (!name) return null;
  const contactTypeRaw = asStr(payload.contactType);
  const contactType = ALLOWED_CONTACT_TYPES.has(contactTypeRaw)
    ? contactTypeRaw
    : "Other";
  const lowConfidence = asStrArray(payload.lowConfidence);
  if (contactType !== contactTypeRaw && !lowConfidence.includes("contactType")) {
    lowConfidence.push("contactType");
  }
  const orgName = asStr(payload.organisationName);
  const cleanedPayload: Record<string, unknown> = {
    name,
    email: asStr(payload.email),
    phone: asStr(payload.phone),
    role: asStr(payload.role),
    geography: asStr(payload.geography),
    sector: asStr(payload.sector),
    contactType,
    organisationName: orgName,
    organisationType: asStr(payload.organisationType),
    organisationDescription: asStr(payload.organisationDescription),
    notes: asStr(payload.notes),
    lowConfidence,
  };
  return {
    kind: "contact",
    title: clipString(asStr(raw.title) || name, 200),
    summary: clipString(asStr(raw.summary), 500),
    detail: clipString(asStr(raw.detail), 2000),
    payload: cleanedPayload,
  };
}

function normaliseOrganisation(
  raw: Record<string, unknown>,
): ExtractedRow | null {
  const payload = asObj(raw.payload);
  const name = asStr(payload.name);
  if (!name) return null;
  const cleanedPayload: Record<string, unknown> = {
    name,
    type: asStr(payload.type),
    description: asStr(payload.description),
    lowConfidence: asStrArray(payload.lowConfidence),
  };
  return {
    kind: "organisation",
    title: clipString(asStr(raw.title) || name, 200),
    summary: clipString(asStr(raw.summary), 500),
    detail: clipString(asStr(raw.detail), 2000),
    payload: cleanedPayload,
  };
}

function normaliseIntroRequest(
  raw: Record<string, unknown>,
): ExtractedRow | null {
  const payload = asObj(raw.payload);
  const innerTitle = asStr(payload.title);
  const body = asStr(payload.body);
  const context = asStr(payload.context);
  const topTitle = asStr(raw.title);
  if (!innerTitle && !topTitle && !body) return null;
  const cleanedPayload: Record<string, unknown> = {
    title: innerTitle || topTitle || "Introduction request",
    body,
    context,
  };
  return {
    kind: "intro_request",
    title: clipString(topTitle || innerTitle || "Introduction request", 200),
    summary: clipString(asStr(raw.summary), 500),
    detail: clipString(asStr(raw.detail) || body, 2000),
    payload: cleanedPayload,
  };
}

function normaliseRow(raw: unknown): ExtractedRow | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = asStr(row.kind);
  switch (kind) {
    case "contact":
      return normaliseContact(row);
    case "organisation":
      return normaliseOrganisation(row);
    case "intro_request":
      return normaliseIntroRequest(row);
    default:
      return null;
  }
}

/**
 * Run the LLM extractor over an email and return validated extraction rows.
 * On any failure (model error, malformed JSON), returns an empty list rather
 * than throwing so ingestion still produces a usable email row.
 */
export async function extractFromEmail(
  input: ExtractEmailInput,
): Promise<ExtractedRow[]> {
  const system = buildEmailExtractSystemPrompt();
  const userContent = buildEmailExtractUserContent(input);

  let raw: string;
  try {
    raw = await completeAnthropicMessage({
      system,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 2048,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] email extractor model call failed:", err);
    }
    return [];
  }

  const obj = extractJsonObject(raw);
  if (!obj) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[rex-robson] email extractor returned non-JSON:",
        raw.slice(0, 500),
      );
    }
    return [];
  }
  const list = obj.extractions;
  if (!Array.isArray(list)) return [];
  const out: ExtractedRow[] = [];
  for (const item of list) {
    const row = normaliseRow(item);
    if (row) out.push(row);
  }
  return out;
}
