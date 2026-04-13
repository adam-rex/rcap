/**
 * Shapes used when calling Anthropic Messages API (or compatible gateways).
 * Adjust `AnthropicMessage` if you add tool_use / image blocks later.
 */

export type AnthropicMessageRole = "user" | "assistant";

export type AnthropicTextMessage = {
  role: AnthropicMessageRole;
  content: string;
};

export type RexAnthropicRequest = {
  system: string;
  messages: AnthropicTextMessage[];
};
