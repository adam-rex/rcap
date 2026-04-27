import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

/**
 * Normalised shape consumed by ingestForwardedEmail. Either come from
 * mailparser (an .eml file or raw RFC822 text) or be supplied directly by a
 * caller that already has structured fields (e.g. a future webhook).
 */
export type NormalisedInboundEmail = {
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  receivedAt: string;
  externalMessageId: string | null;
  rawHeaders: Record<string, unknown> | null;
  attachments: NormalisedInboundAttachment[];
};

export type NormalisedInboundAttachment = {
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  content: Buffer;
};

const SNIPPET_MAX = 160;

function extractAddresses(addr: AddressObject | AddressObject[] | undefined): string[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  const out: string[] = [];
  for (const obj of list) {
    for (const v of obj.value ?? []) {
      const a = v.address?.trim();
      if (a) out.push(a);
    }
  }
  return out;
}

function pickFirstAddress(addr: AddressObject | undefined): {
  name: string | null;
  address: string;
} | null {
  if (!addr) return null;
  for (const v of addr.value ?? []) {
    const a = v.address?.trim();
    if (a) {
      const name = v.name?.trim();
      return { name: name && name !== a ? name : null, address: a };
    }
  }
  return null;
}

function buildSnippet(text: string | null, html: string | null): string | null {
  const source = text?.trim() || htmlToPlainText(html);
  if (!source) return null;
  const collapsed = source.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > SNIPPET_MAX
    ? collapsed.slice(0, SNIPPET_MAX - 1).trimEnd() + "\u2026"
    : collapsed;
}

function htmlToPlainText(html: string | null): string {
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
    .replace(/&#39;/gi, "'");
}

function headersToPlainObject(parsed: ParsedMail): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of parsed.headers ?? new Map()) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v == null
    ) {
      out[k] = v as unknown;
    } else {
      try {
        out[k] = JSON.parse(JSON.stringify(v));
      } catch {
        out[k] = String(v);
      }
    }
  }
  return out;
}

/**
 * Parse a raw RFC822 source (Buffer or string) into the shape we persist.
 */
export async function parseRawEmail(
  source: Buffer | string,
): Promise<NormalisedInboundEmail> {
  const parsed = await simpleParser(source);
  const from = pickFirstAddress(parsed.from);
  if (!from) {
    throw new Error("Email is missing a From address; cannot ingest.");
  }
  const toAddresses = extractAddresses(parsed.to);
  const ccAddresses = extractAddresses(parsed.cc);
  const bodyText = (parsed.text ?? "").trim() || null;
  const bodyHtml = typeof parsed.html === "string" ? parsed.html : null;
  const snippet = buildSnippet(bodyText, bodyHtml);
  const receivedAt = (parsed.date ?? new Date()).toISOString();
  const externalMessageId = parsed.messageId?.trim() || null;
  const subject = (parsed.subject ?? "").trim();
  const attachments: NormalisedInboundAttachment[] = (parsed.attachments ?? [])
    .filter((a) => a.contentDisposition !== "inline")
    .map((a) => ({
      filename: (a.filename ?? "attachment").slice(0, 200),
      contentType: a.contentType ?? null,
      sizeBytes: typeof a.size === "number" ? a.size : a.content?.length ?? null,
      content: a.content,
    }));

  return {
    fromName: from.name,
    fromAddress: from.address,
    toAddresses,
    ccAddresses,
    subject,
    bodyText,
    bodyHtml,
    snippet,
    receivedAt,
    externalMessageId,
    rawHeaders: headersToPlainObject(parsed),
    attachments,
  };
}

/**
 * Build a NormalisedInboundEmail from a JSON payload (e.g. user pasted text or
 * provider webhook with already-parsed fields).
 */
export function buildNormalisedFromJson(input: {
  fromName?: string | null;
  fromAddress: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  subject?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt?: string;
  externalMessageId?: string | null;
  rawHeaders?: Record<string, unknown> | null;
}): NormalisedInboundEmail {
  const fromAddress = input.fromAddress.trim();
  if (!fromAddress) {
    throw new Error("fromAddress is required.");
  }
  const bodyText = input.bodyText?.trim() ? input.bodyText.trim() : null;
  const bodyHtml = input.bodyHtml ?? null;
  return {
    fromName: input.fromName?.trim() ? input.fromName.trim() : null,
    fromAddress,
    toAddresses: (input.toAddresses ?? []).map((s) => s.trim()).filter(Boolean),
    ccAddresses: (input.ccAddresses ?? []).map((s) => s.trim()).filter(Boolean),
    subject: input.subject?.trim() ?? "",
    bodyText,
    bodyHtml,
    snippet: buildSnippet(bodyText, bodyHtml),
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    externalMessageId: input.externalMessageId?.trim() || null,
    rawHeaders: input.rawHeaders ?? null,
    attachments: [],
  };
}
