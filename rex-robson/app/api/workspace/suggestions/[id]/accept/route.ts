import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  acceptSuggestionAsMatch,
  getWorkspaceWriteClient,
} from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const result = await acceptSuggestionAsMatch(client, id);
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "missing_pair"
            ? 422
            : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json(
      { match: result.match, suggestionId: result.suggestion.id },
      { status: 201 },
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "accept_suggestion_failed";
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[rex-robson] POST /api/workspace/suggestions/[id]/accept:",
        e,
      );
    }
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        {
          error:
            "An open match for this pair already exists. Close it first or pick another suggestion.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
