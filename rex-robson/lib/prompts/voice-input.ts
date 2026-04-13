import { joinPromptSections } from "./compose";
import { REX_PERSONA_CORE } from "./persona";
import { buildSurfacesSystemAddendum } from "./surfaces";
import type { RexAnthropicRequest } from "./types";

const VOICE_CHANNEL = `
The user's message was produced by speech-to-text (e.g. OpenAI Whisper). The transcript may include filler words, false starts, homophones, missing punctuation, or wrong proper nouns. Infer intent generously; when a name or company sounds wrong, ask a brief confirmation instead of guessing silently.
`.trim();

export type BuildVoiceSystemOptions = {
  includeSurfaces?: boolean;
};

export function buildVoiceSystemPrompt(
  options: BuildVoiceSystemOptions = {},
): string {
  const { includeSurfaces = true } = options;
  return joinPromptSections(
    REX_PERSONA_CORE,
    VOICE_CHANNEL,
    includeSurfaces ? buildSurfacesSystemAddendum() : false,
  );
}

/**
 * User turn content after Whisper — ready to append to the conversation or send as a single user message.
 */
export function buildVoiceUserContent(transcript: string): string {
  const t = transcript.trim();
  return `Voice transcript (verbatim):

"""
${t}
"""`;
}

export function buildVoiceAnthropicRequest(
  transcript: string,
  options?: BuildVoiceSystemOptions,
): RexAnthropicRequest {
  return {
    system: buildVoiceSystemPrompt(options),
    messages: [{ role: "user", content: buildVoiceUserContent(transcript) }],
  };
}
