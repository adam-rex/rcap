import { generateIntroMatchesForContact } from "@/lib/data/intro-match-suggestions";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

type Body = { contactId?: unknown; limit?: unknown };

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-fA-F-]{8,}$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contactId = parseUuid(body.contactId);
  if (!contactId) {
    return Response.json({ error: "contactId is required" }, { status: 400 });
  }
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(10, Math.floor(body.limit)))
      : 3;

  try {
    const client = await getWorkspaceWriteClient();
    const matches = await generateIntroMatchesForContact(
      client,
      contactId,
      limit,
    );
    return Response.json({ matches });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Matching failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/rex/capture/match:", e);
    }
    return Response.json({ error: message }, { status: 503 });
  }
}
