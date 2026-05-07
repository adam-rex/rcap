import type { AnthropicTextMessage } from "@/lib/prompts/types";
import { getAnthropicApiKey, getAnthropicModel } from "./anthropic-config";

type MessagesResponse = {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string; type?: string };
};

const OVERLOAD_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAnthropicOverloaded(
  status: number,
  data: MessagesResponse,
): boolean {
  if (status === 529) return true;
  const t = data.error?.type;
  if (t === "overloaded_error") return true;
  const msg = data.error?.message ?? "";
  return /overload/i.test(msg);
}

/**
 * Single-turn completion via Anthropic Messages API (server-only).
 */
export async function completeAnthropicMessage(params: {
  system: string;
  messages: AnthropicTextMessage[];
  maxTokens?: number;
}): Promise<string> {
  const apiKey = getAnthropicApiKey();
  const model = getAnthropicModel();
  const max_tokens = params.maxTokens ?? 2048;

  const body = JSON.stringify({
    model,
    max_tokens,
    system: params.system,
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let lastMessage = "Anthropic request failed";

  for (let attempt = 0; attempt <= OVERLOAD_MAX_RETRIES; attempt += 1) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const data = (await res.json()) as MessagesResponse;

    if (!res.ok) {
      lastMessage = (data.error?.message ?? res.statusText) || lastMessage;
      if (isAnthropicOverloaded(res.status, data) && attempt < OVERLOAD_MAX_RETRIES) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      throw new Error(lastMessage || "Anthropic request failed");
    }

    const text = data.content
      ?.filter(
        (b): b is { type: "text"; text: string } =>
          b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("Empty response from Anthropic");
    }

    return text;
  }

  throw new Error(lastMessage);
}
