import { NextResponse } from "next/server";
import {
  ingestForwardedEmail,
  type IngestEmailInput,
} from "@/lib/email/ingest";
import { verifyGenericEmailIngestAccess } from "@/lib/email/ingest-route-auth";
import { getEmailIngestSupabaseClient } from "@/lib/supabase/ingest-client";

export const runtime = "nodejs";

const MAX_EML_BYTES = 25 * 1024 * 1024;
const MAX_BODY_CHARS = 200_000;
const MAX_RAW_TEXT_CHARS = 500_000;

function strArrayFromUnknown(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isLikelyRfc822(s: string): boolean {
  const head = s.slice(0, 2048).toLowerCase();
  return /(^|\n)from:\s.+/.test(head) && /(^|\n)(subject|date|message-id|to):\s/.test(head);
}

function buildJsonInput(body: Record<string, unknown>): IngestEmailInput | { error: string } {
  const fromAddress =
    typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
  if (!fromAddress) {
    return {
      error:
        "fromAddress is required (or send raw mime as { rawText } / multipart eml).",
    };
  }
  const subject = typeof body.subject === "string" ? body.subject : "";
  const bodyText =
    typeof body.bodyText === "string"
      ? body.bodyText.slice(0, MAX_BODY_CHARS)
      : null;
  const bodyHtml =
    typeof body.bodyHtml === "string"
      ? body.bodyHtml.slice(0, MAX_BODY_CHARS)
      : null;
  const fromName = typeof body.fromName === "string" ? body.fromName : null;
  const receivedAt =
    typeof body.receivedAt === "string" && body.receivedAt
      ? body.receivedAt
      : undefined;
  const externalMessageId =
    typeof body.externalMessageId === "string" && body.externalMessageId
      ? body.externalMessageId
      : null;
  return {
    kind: "json",
    data: {
      fromAddress,
      fromName,
      toAddresses: strArrayFromUnknown(body.toAddresses),
      ccAddresses: strArrayFromUnknown(body.ccAddresses),
      subject,
      bodyText,
      bodyHtml,
      receivedAt,
      externalMessageId,
    },
  };
}

async function buildMultipartInput(
  req: Request,
): Promise<IngestEmailInput | { error: string }> {
  const form = await req.formData();
  const eml = form.get("eml");
  if (eml instanceof File && eml.size > 0) {
    if (eml.size > MAX_EML_BYTES) {
      return { error: ".eml file is too large (limit 25 MB)" };
    }
    const buf = Buffer.from(await eml.arrayBuffer());
    return { kind: "raw", source: buf };
  }
  const rawText = form.get("rawText");
  if (typeof rawText === "string" && rawText.trim()) {
    if (rawText.length > MAX_RAW_TEXT_CHARS) {
      return { error: "rawText is too large" };
    }
    return { kind: "raw", source: rawText };
  }
  return { error: 'Provide "eml" file or "rawText" string' };
}

async function buildJsonOrRawInput(
  req: Request,
): Promise<IngestEmailInput | { error: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: "Invalid JSON body" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "JSON body must be an object" };
  }
  const body = raw as Record<string, unknown>;
  const rawText = body.rawText;
  if (typeof rawText === "string" && rawText.trim()) {
    if (rawText.length > MAX_RAW_TEXT_CHARS) {
      return { error: "rawText is too large" };
    }
    if (isLikelyRfc822(rawText)) {
      return { kind: "raw", source: rawText };
    }
    const fromAddress =
      typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
    if (!fromAddress) {
      return {
        error:
          "rawText does not look like RFC822 mail; pass fromAddress + bodyText to ingest as a structured paste.",
      };
    }
    return buildJsonInput({ ...body, bodyText: rawText });
  }
  return buildJsonInput(body);
}

export async function POST(req: Request) {
  const access = await verifyGenericEmailIngestAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let input: IngestEmailInput | { error: string };
  if (contentType.includes("multipart/form-data")) {
    input = await buildMultipartInput(req);
  } else {
    input = await buildJsonOrRawInput(req);
  }
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const client = await getEmailIngestSupabaseClient(access.via);
    const result = await ingestForwardedEmail(client, input);
    return NextResponse.json({
      ok: true,
      emailId: result.emailId,
      extractionsCount: result.extractionsCount,
      attachmentsCount: result.attachmentsCount,
      dedup: result.dedup,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email ingest failed";
    if (
      typeof message === "string" &&
      message.includes("SUPABASE_SERVICE_ROLE_KEY")
    ) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: set SUPABASE_SERVICE_ROLE_KEY for webhook ingest without a user session.",
        },
        { status: 503 },
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] POST email ingest:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
