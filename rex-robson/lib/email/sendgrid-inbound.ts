import type { IngestEmailInput } from "@/lib/email/ingest";
import {
  buildNormalisedFromJson,
  type NormalisedInboundAttachment,
} from "@/lib/email/parse-eml";

const MAX_RAW_BYTES = 25 * 1024 * 1024;

function parseAngleFromField(from: string): { name: string | null; address: string } {
  const t = from.trim();
  const m = t.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    let name = m[1].trim().replace(/^["']|["']$/g, "");
    const address = m[2].trim();
    if (!address) {
      throw new Error("SendGrid payload: From header had empty address inside <>.");
    }
    return { name: name || null, address };
  }
  if (!t) {
    throw new Error("SendGrid payload: missing From.");
  }
  return { name: null, address: t };
}

function addressFromToken(token: string): string {
  const { address } = parseAngleFromField(token.trim());
  return address;
}

function splitRecipientList(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((token) => addressFromToken(token));
}

function parseSendGridAddressField(value: FormDataEntryValue | null): string[] {
  if (value == null || value instanceof File) return [];
  const s = value.trim();
  if (!s) return [];
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (Array.isArray(o.to)) {
        return (o.to as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => addressFromToken(x))
          .filter(Boolean);
      }
      if (typeof o.to === "string") {
        return splitRecipientList(o.to);
      }
    } catch {
      /* fall through */
    }
  }
  return splitRecipientList(s);
}

function extractMessageIdFromHeaders(headers: string | null): string | null {
  if (!headers?.trim()) return null;
  const m = headers.match(/^message-id:\s*(.+)$/im);
  if (!m) return null;
  return m[1].trim().replace(/^<|>$/g, "") || null;
}

function headersToRawRecord(headers: string | null): Record<string, unknown> | null {
  if (!headers?.trim()) return null;
  return { sendgrid_headers: headers };
}

type AttachmentInfoEntry = {
  filename?: string;
  name?: string;
  type?: string;
};

function parseAttachmentInfo(raw: string): Record<string, AttachmentInfoEntry> | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    return o as Record<string, AttachmentInfoEntry>;
  } catch {
    return null;
  }
}

async function collectSendGridAttachments(
  form: FormData,
): Promise<NormalisedInboundAttachment[]> {
  const infoRaw = form.get("attachment-info");
  const info =
    typeof infoRaw === "string" && infoRaw.trim()
      ? parseAttachmentInfo(infoRaw.trim())
      : null;

  const out: NormalisedInboundAttachment[] = [];

  if (info) {
    for (const [fieldName, meta] of Object.entries(info)) {
      const v = form.get(fieldName);
      if (!(v instanceof File) || v.size === 0) continue;
      if (v.size > MAX_RAW_BYTES) {
        throw new Error(`Attachment ${fieldName} exceeds size limit.`);
      }
      const buf = Buffer.from(await v.arrayBuffer());
      const filename =
        (meta.filename ?? meta.name ?? v.name ?? fieldName).slice(0, 200) || fieldName;
      out.push({
        filename,
        contentType: (meta.type ?? v.type)?.trim() || null,
        sizeBytes: v.size,
        content: buf,
      });
    }
    return out;
  }

  for (const key of form.keys()) {
    if (!/^attachment\d+$/i.test(key)) continue;
    const v = form.get(key);
    if (!(v instanceof File) || v.size === 0) continue;
    if (v.size > MAX_RAW_BYTES) {
      throw new Error(`Attachment ${key} exceeds size limit.`);
    }
    const buf = Buffer.from(await v.arrayBuffer());
    out.push({
      filename: (v.name || key).slice(0, 200),
      contentType: v.type || null,
      sizeBytes: v.size,
      content: buf,
    });
  }
  return out;
}

function parseEnvelopeTo(form: FormData): string[] {
  const raw = form.get("envelope");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const o = JSON.parse(raw) as { to?: string[] };
    return (o.to ?? []).map((x) => x.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function rawInputFromEmailField(
  emailField: FormDataEntryValue,
): Promise<IngestEmailInput | null> {
  if (emailField instanceof File) {
    if (emailField.size === 0) return null;
    if (emailField.size > MAX_RAW_BYTES) {
      throw new Error("Raw MIME (email field) exceeds 25 MB.");
    }
    const buf = Buffer.from(await emailField.arrayBuffer());
    return { kind: "raw", source: buf };
  }
  if (typeof emailField !== "string") return null;
  let mime = emailField.trim();
  if (!mime) return null;
  if (mime.length > MAX_RAW_BYTES) {
    throw new Error("Raw MIME (email field) exceeds 25 MB.");
  }
  if (!/(^|\n)from:\s/im.test(mime)) {
    try {
      const decoded = decodeURIComponent(mime);
      if (/(^|\n)from:\s/im.test(decoded)) {
        mime = decoded;
      }
    } catch {
      /* keep mime */
    }
  }
  return { kind: "raw", source: mime };
}

/**
 * Map a SendGrid Inbound Parse POST body (multipart or url-encoded FormData)
 * to {@link IngestEmailInput}.
 *
 * Prefer enabling **POST the raw, full MIME message** in SendGrid so the `email`
 * field is present — attachments and threading match the main ingest path.
 */
export async function sendGridFormDataToIngestInput(
  form: FormData,
): Promise<IngestEmailInput> {
  const emailField = form.get("email");
  if (emailField != null) {
    const raw = await rawInputFromEmailField(emailField);
    if (raw) return raw;
  }

  const fromRaw = form.get("from");
  if (typeof fromRaw !== "string" || !fromRaw.trim()) {
    throw new Error(
      'SendGrid payload missing "from". Enable "POST the raw, full MIME message" and the "email" field, or include parsed from/to/subject.',
    );
  }
  const { name: fromName, address: fromAddress } = parseAngleFromField(fromRaw);

  let toAddresses = parseSendGridAddressField(form.get("to"));
  const envTo = parseEnvelopeTo(form);
  if (toAddresses.length === 0 && envTo.length > 0) {
    toAddresses = envTo;
  }

  const ccRaw = form.get("cc");
  const ccAddresses =
    typeof ccRaw === "string" && ccRaw.trim()
      ? parseSendGridAddressField(ccRaw)
      : [];

  const subjectRaw = form.get("subject");
  const subject = typeof subjectRaw === "string" ? subjectRaw : "";

  const textRaw = form.get("text");
  const htmlRaw = form.get("html");
  const bodyText = typeof textRaw === "string" && textRaw.trim() ? textRaw : null;
  const bodyHtml = typeof htmlRaw === "string" && htmlRaw.trim() ? htmlRaw : null;

  const headersRaw = form.get("headers");
  const headersStr =
    typeof headersRaw === "string" && headersRaw.trim() ? headersRaw : null;
  const externalMessageId = extractMessageIdFromHeaders(headersStr);

  const jsonData = {
    fromName,
    fromAddress,
    toAddresses,
    ccAddresses,
    subject,
    bodyText,
    bodyHtml,
    externalMessageId,
    rawHeaders: headersToRawRecord(headersStr),
  };

  const attachments = await collectSendGridAttachments(form);

  if (attachments.length === 0) {
    return { kind: "json", data: jsonData };
  }

  const base = buildNormalisedFromJson(jsonData);
  return {
    kind: "normalised",
    data: {
      ...base,
      attachments,
    },
  };
}
