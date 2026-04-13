import type { AnthropicTextMessage } from "@/lib/prompts/types";

function getAnthropicApiKey(): string | undefined {
  return (
    process.env.ANTHROPIC_API_KEY ??
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ??
    undefined
  );
}

type MessagesResponse = {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
};

/**
 * Single-turn completion via Anthropic Messages API (server-only).
 */
export async function completeAnthropicMessage(params: {
  system: string;
  messages: AnthropicTextMessage[];
  maxTokens?: number;
}): Promise<string> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY (or NEXT_PUBLIC_ANTHROPIC_API_KEY for local dev only).");
  }

  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
  const max_tokens = params.maxTokens ?? 2048;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens,
      system: params.system,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  const data = (await res.json()) as MessagesResponse;

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(msg || "Anthropic request failed");
  }

  const text = data.content
    ?.filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Empty response from Anthropic");
  }

  return text;
}
