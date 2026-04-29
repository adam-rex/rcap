import { NextRequest, NextResponse } from "next/server";
import { ingestForwardedEmail } from "@/lib/email/ingest";
import { verifySendGridIngestSecret } from "@/lib/email/ingest-route-auth";
import { sendGridFormDataToIngestInput } from "@/lib/email/sendgrid-inbound";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Twilio SendGrid Inbound Parse webhook.
 *
 * Configure in SendGrid: destination URL e.g.
 * `https://your-host/api/rex/email/ingest/sendgrid?secret=YOUR_SECRET`
 *
 * Production: set `SENDGRID_INBOUND_PARSE_SECRET` (401 if missing). Development may omit it.
 *
 * Enable **POST the raw, full MIME message** so the `email` field is sent
 * (best fidelity, including attachments). Parsed-only mode is also supported.
 */
export async function POST(req: NextRequest) {
  if (!verifySendGridIngestSecret(req)) {
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
    const client = tryCreateServiceRoleClient();
    if (!client) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is required for SendGrid inbound parse (no user session on webhooks).",
        },
        { status: 503 },
      );
    }
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
