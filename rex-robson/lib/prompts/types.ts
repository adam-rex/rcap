/**
 * Shapes used when calling Anthropic Messages API (or compatible gateways).
 * Adjust `AnthropicMessage` if you add tool_use / image blocks later.
 */

export type AnthropicMessageRole = "user" | "assistant";

export type AnthropicTextBlock = { type: "text"; text: string };

export type AnthropicDocumentBlock = {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf";
    data: string;
  };
  title?: string;
};

export type AnthropicImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export type AnthropicImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: AnthropicImageMediaType;
    data: string;
  };
};

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicDocumentBlock
  | AnthropicImageBlock;

export type AnthropicTextMessage = {
  role: AnthropicMessageRole;
  content: string | AnthropicContentBlock[];
};

export type RexAnthropicRequest = {
  system: string;
  messages: AnthropicTextMessage[];
};
