import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  applyRexEmailExtraction,
  dismissRexEmailExtraction,
} from "@/lib/data/workspace-email-extractions";
import { fetchWorkspaceEmailDetailWithClient } from "@/lib/data/workspace-emails";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

type RouteContext = {
  params: Promise<{ id: string; extractionId: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const { id: emailId, extractionId } = await context.params;
  if (!isValidUuid(emailId) || !isValidUuid(extractionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const action = body.action;
  if (action !== "dismiss" && action !== "apply") {
    return NextResponse.json(
      { error: 'action must be "dismiss" or "apply"' },
      { status: 400 },
    );
  }

  const payloadOverride =
    body.payload != null &&
    typeof body.payload === "object" &&
    !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined;

  try {
    const client = await getWorkspaceWriteClient();

    if (action === "dismiss") {
      const ok = await dismissRexEmailExtraction(client, emailId, extractionId);
      if (!ok) {
        return NextResponse.json(
          { error: "Extraction not found or already handled." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, status: "dismissed" });
    }

    const email = await fetchWorkspaceEmailDetailWithClient(client, emailId);
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const res = await applyRexEmailExtraction(client, {
      emailId,
      extractionId,
      receivedAt: email.receivedAt,
      payloadOverrides: payloadOverride,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: "applied",
      result: {
        createdContactId: res.result.createdContactId,
        createdOrganisationId: res.result.createdOrganisationId,
        createdDealId: res.result.createdDealId,
        createdSuggestionId: res.result.createdSuggestionId,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] PATCH extraction:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
