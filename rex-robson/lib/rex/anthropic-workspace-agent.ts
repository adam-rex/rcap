import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSearchUserContent } from "@/lib/prompts/search";
import { buildSearchToolsSystemPrompt } from "@/lib/prompts/search-agent";
import {
  type WorkspaceToolName,
  runWorkspaceTool,
} from "@/lib/data/workspace-tool-runner";
import { getAnthropicApiKey, getAnthropicModel } from "./anthropic-config";

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AssistantBlock = TextBlock | ToolUseBlock;

type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type ApiMessage =
  | { role: "user"; content: string | ToolResultBlock[] }
  | { role: "assistant"; content: AssistantBlock[] };

type MessagesApiResponse = {
  content?: AssistantBlock[];
  stop_reason?: string;
  error?: { message?: string };
};

export const WORKSPACE_SEARCH_TOOLS = [
  {
    name: "search_contacts",
    description:
      "Search contacts by substring (ILIKE) on name, role, notes, geography, contact_type, sector, phone, email, and text built from sectors[] and deal_types[] arrays.",
    input_schema: {
      type: "object",
      properties: {
        search_term: {
          type: "string",
          description: "Substring to search for after sanitization.",
        },
        limit: {
          type: "integer",
          description: "Max rows to return (1–25). Default 12.",
        },
      },
      required: ["search_term"],
    },
  },
  {
    name: "search_organisations",
    description:
      "Search organisations by substring on name, description, and type.",
    input_schema: {
      type: "object",
      properties: {
        search_term: { type: "string" },
        limit: { type: "integer", description: "1–25, default 12" },
      },
      required: ["search_term"],
    },
  },
  {
    name: "search_matches",
    description:
      "Search intro matches between two contacts by substring on context and notes. Returns rows with both contact names, kind (founder·investor / founder·lender), stage, and outcome.",
    input_schema: {
      type: "object",
      properties: {
        search_term: { type: "string" },
        limit: { type: "integer", description: "1–25, default 12" },
      },
      required: ["search_term"],
    },
  },
  {
    name: "search_suggestions",
    description:
      "Search pending suggestions by substring on title and body.",
    input_schema: {
      type: "object",
      properties: {
        search_term: { type: "string" },
        limit: { type: "integer", description: "1–25, default 12" },
      },
      required: ["search_term"],
    },
  },
] as const;

function isWorkspaceToolName(name: string): name is WorkspaceToolName {
  return (
    name === "search_contacts" ||
    name === "search_organisations" ||
    name === "search_matches" ||
    name === "search_suggestions"
  );
}

function extractAssistantText(blocks: AssistantBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Tool-calling agent for workspace search (parallel-friendly). Does not include deterministic baseline.
 */
export async function runWorkspaceSearchAgent(params: {
  supabase: SupabaseClient;
  userQuery: string;
  maxRounds?: number;
}): Promise<string> {
  const apiKey = getAnthropicApiKey();
  const model = getAnthropicModel();
  const system = buildSearchToolsSystemPrompt();
  const maxRounds = params.maxRounds ?? 8;
  const maxTokensPerRound = 4096;

  const messages: ApiMessage[] = [
    {
      role: "user",
      content: buildSearchUserContent(params.userQuery),
    },
  ];

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokensPerRound,
        system,
        tools: WORKSPACE_SEARCH_TOOLS,
        messages,
      }),
    });

    const data = (await res.json()) as MessagesApiResponse;

    if (!res.ok) {
      const msg = data.error?.message ?? res.statusText;
      throw new Error(msg || "Anthropic request failed");
    }

    const content = data.content ?? [];
    if (content.length === 0) {
      throw new Error("Empty assistant content from Anthropic");
    }

    messages.push({ role: "assistant", content });

    const toolUses = content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length > 0) {
      const toolResults: ToolResultBlock[] = await Promise.all(
        toolUses.map(async (tu) => {
          const name = tu.name;
          if (!isWorkspaceToolName(name)) {
            return {
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: JSON.stringify({
                error: `unknown_tool:${name}`,
                rows: [],
              }),
            };
          }
          const payload = await runWorkspaceTool(
            params.supabase,
            name,
            tu.input ?? {},
          );
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: payload,
          };
        }),
      );
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const text = extractAssistantText(content);
    if (text) return text;
    return "I didn’t get a clear answer — try rephrasing your search.";
  }

  return "That search needed too many steps. Try a shorter or more specific query.";
}
