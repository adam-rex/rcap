import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * SendGrid Inbound Parse: require secret in production; dev allows open endpoint
 * when unset (matches prior behaviour).
 */
export function verifySendGridIngestSecret(req: NextRequest): boolean {
  const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const query = req.nextUrl.searchParams.get("secret");
  const header = req.headers.get("x-rex-ingest-secret");
  return query === secret || header === secret;
}

function matchesGenericWebhookSecret(req: Request, secret: string): boolean {
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const h = req.headers.get("x-rex-ingest-secret");
  return q === secret || h === secret;
}

/**
 * POST /api/rex/email/ingest — browser quick-capture (logged-in session) or
 * relay with REX_EMAIL_INGEST_SECRET via ?secret= or X-Rex-Ingest-Secret.
 *
 * In production: require a valid Supabase session unless the webhook secret matches.
 * In development: allow unauthenticated requests (local testing without login).
 */
export async function verifyGenericEmailIngestAccess(
  req: Request,
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const webhookSecret = process.env.REX_EMAIL_INGEST_SECRET;
  if (webhookSecret && matchesGenericWebhookSecret(req, webhookSecret)) {
    return true;
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session;
}
