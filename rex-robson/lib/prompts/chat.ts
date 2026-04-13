import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";
import { buildSurfacesSystemAddendum } from "./surfaces";
import type { RexAnthropicRequest } from "./types";

export type BuildChatSystemOptions = {
  includeSurfaces?: boolean;
  /** e.g. SUGGESTIONS_SURFACE_SYSTEM when the UI route is suggestions */
  surfaceExtension?: string;
};

export function buildChatSystemPrompt(
  options: BuildChatSystemOptions = {},
): string {
  const { includeSurfaces = true, surfaceExtension } = options;
  return joinPromptSections(
    REX_PERSONA_CORE,
    includeSurfaces ? buildSurfacesSystemAddendum() : false,
    surfaceExtension,
  );
}

export function buildChatUserContent(text: string): string {
  return text.trim();
}

export function buildChatAnthropicRequest(
  userMessage: string,
  options?: BuildChatSystemOptions,
): RexAnthropicRequest {
  return {
    system: buildChatSystemPrompt(options),
    messages: [{ role: "user", content: buildChatUserContent(userMessage) }],
  };
}
