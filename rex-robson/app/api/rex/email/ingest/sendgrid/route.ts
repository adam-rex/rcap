import { NextRequest, NextResponse } from "next/server";
import { ingestForwardedEmail } from "@/lib/email/ingest";
import { sendGridFormDataToIngestInput } from "@/lib/email/sendgrid-inbound";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

function verifyIngestSecret(req: NextRequest): boolean {
  const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
  if (!secret) return true;
  const query = req.nextUrl.searchParams.get("secret");
  const header = req.headers.get("x-rex-ingest-secret");
  return query === secret || header === secret;
}

/**
 * Twilio SendGrid Inbound Parse webhook.
 *
 * Configure in SendGrid: destination URL e.g.
 * `https://your-host/api/rex/email/ingest/sendgrid?secret=YOUR_SECRET`
 *
 * Enable **POST the raw, full MIME message** so the `email` field is sent
 * (best fidelity, including attachments). Parsed-only mode is also supported.
 */
export async function POST(req: NextRequest) {
  if (!verifyIngestSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  let input: Awaited<ReturnType<typeof sendGridFormDataToIngestInput>>;
  try {
    input = await sendGridFormDataToIngestInput(form);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid SendGrid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
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
    if (process.env.NODE_ENV !== "production") {
      console.error("[rex-robson] POST SendGrid inbound parse:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
