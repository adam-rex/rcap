import { buildSearchAnthropicRequest } from "@/lib/prompts";
import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";

export const runtime = "nodejs";

type Body = {
  query?: string;
};

/**
 * Experimental: builds the search-oriented system + user prompt, then calls Anthropic.
 * Wire the chat/search box here; later add Supabase retrieval into BuildSearchSystemOptions.retrievalContext.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const { system, messages } = buildSearchAnthropicRequest(query);
    const text = await completeAnthropicMessage({ system, messages });
    return Response.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
