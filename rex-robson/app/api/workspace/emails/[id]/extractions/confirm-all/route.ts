import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import { confirmAllPendingRexEmailExtractions } from "@/lib/data/workspace-email-extractions";
import { fetchWorkspaceEmailDetailWithClient } from "@/lib/data/workspace-emails";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const { id: emailId } = await context.params;
  if (!isValidUuid(emailId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const email = await fetchWorkspaceEmailDetailWithClient(client, emailId);
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const { applied, errors } = await confirmAllPendingRexEmailExtractions(
      client,
      { emailId, receivedAt: email.receivedAt },
    );

    return NextResponse.json({
      ok: true,
      applied,
      errors,
      hadErrors: errors.length > 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST confirm-all extractions:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
