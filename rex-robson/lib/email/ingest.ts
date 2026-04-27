import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNormalisedFromJson,
  parseRawEmail,
  type NormalisedInboundEmail,
} from "@/lib/email/parse-eml";
import { extractFromEmail } from "@/lib/rex/email-extractor";

export const REX_EMAIL_ATTACHMENTS_BUCKET = "rex-email-attachments";

export type IngestEmailInput =
  | { kind: "raw"; source: Buffer | string }
  | { kind: "json"; data: Parameters<typeof buildNormalisedFromJson>[0] }
  | { kind: "normalised"; data: NormalisedInboundEmail };

export type IngestEmailResult = {
  emailId: string;
  extractionsCount: number;
  attachmentsCount: number;
  dedup: boolean;
};

async function normalise(input: IngestEmailInput): Promise<NormalisedInboundEmail> {
  if (input.kind === "raw") return parseRawEmail(input.source);
  if (input.kind === "json") return buildNormalisedFromJson(input.data);
  return input.data;
}

async function findExistingByMessageId(
  client: SupabaseClient,
  messageId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("rex_inbound_emails")
    .select("id")
    .eq("external_message_id", messageId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data ? String((data as Record<string, unknown>).id ?? "") || null : null;
}

function safeFilenameSegment(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "file"
  );
}

async function uploadAttachments(
  client: SupabaseClient,
  emailId: string,
  email: NormalisedInboundEmail,
): Promise<number> {
  if (email.attachments.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < email.attachments.length; i += 1) {
    const att = email.attachments[i];
    const path = `${emailId}/${i}-${safeFilenameSegment(att.filename)}`;
    const { error: upErr } = await client.storage
      .from(REX_EMAIL_ATTACHMENTS_BUCKET)
      .upload(path, att.content, {
        contentType: att.contentType ?? "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[rex-robson] attachment upload failed:",
          path,
          upErr.message,
        );
      }
      continue;
    }
    const { error: rowErr } = await client
      .from("rex_inbound_email_attachments")
      .insert({
        email_id: emailId,
        filename: att.filename,
        content_type: att.contentType,
        size_bytes: att.sizeBytes,
        storage_bucket: REX_EMAIL_ATTACHMENTS_BUCKET,
        storage_path: path,
      });
    if (rowErr) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[rex-robson] attachment row insert failed:",
          rowErr.message,
        );
      }
      continue;
    }
    inserted += 1;
  }
  return inserted;
}

async function persistExtractions(
  client: SupabaseClient,
  emailId: string,
  rows: Awaited<ReturnType<typeof extractFromEmail>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const insertRows = rows.map((r) => ({
    email_id: emailId,
    kind: r.kind,
    status: "pending",
    title: r.title,
    summary: r.summary || null,
    detail: r.detail || null,
    payload: r.payload,
  }));
  const { error } = await client
    .from("rex_email_extractions")
    .insert(insertRows);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] extractions insert failed:", error.message);
    }
    return 0;
  }
  return insertRows.length;
}

/**
 * Single source of truth for getting a forwarded / attached email into the
 * rex_inbound_emails pipeline. Future provider webhooks should call this with
 * `{ kind: "raw", source: rawMime }` or `{ kind: "json", data: { ... } }`.
 */
export async function ingestForwardedEmail(
  client: SupabaseClient,
  input: IngestEmailInput,
): Promise<IngestEmailResult> {
  const email = await normalise(input);

  if (email.externalMessageId) {
    const existing = await findExistingByMessageId(
      client,
      email.externalMessageId,
    );
    if (existing) {
      return {
        emailId: existing,
        extractionsCount: 0,
        attachmentsCount: 0,
        dedup: true,
      };
    }
  }

  const { data: inserted, error } = await client
    .from("rex_inbound_emails")
    .insert({
      received_at: email.receivedAt,
      from_name: email.fromName,
      from_address: email.fromAddress,
      to_addresses: email.toAddresses,
      subject: email.subject,
      body_text: email.bodyText,
      body_html: email.bodyHtml,
      snippet: email.snippet,
      external_message_id: email.externalMessageId,
      raw_headers: email.rawHeaders,
      thread_participant_count:
        email.toAddresses.length + email.ccAddresses.length + 1,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!inserted) {
    throw new Error("Insert into rex_inbound_emails returned no row");
  }
  const emailId = String((inserted as Record<string, unknown>).id ?? "");
  if (!emailId) {
    throw new Error("Insert into rex_inbound_emails returned no id");
  }

  const attachmentsCount = await uploadAttachments(client, emailId, email);

  const extractionRows = await extractFromEmail({
    fromName: email.fromName,
    fromAddress: email.fromAddress,
    toAddresses: email.toAddresses,
    ccAddresses: email.ccAddresses,
    subject: email.subject,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    receivedAt: email.receivedAt,
  });
  const extractionsCount = await persistExtractions(
    client,
    emailId,
    extractionRows,
  );

  return {
    emailId,
    extractionsCount,
    attachmentsCount,
    dedup: false,
  };
}
