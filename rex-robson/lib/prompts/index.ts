/**
 * Central prompt assembly for Rex. Import from here in API routes, server actions, or agents.
 *
 * - Chat: buildChatAnthropicRequest / buildChatSystemPrompt
 * - Search: buildSearchAnthropicRequest / buildSearchSystemPrompt
 * - After Whisper: buildVoiceAnthropicRequest / buildVoiceUserContent
 * - Suggestions-focused UI: SUGGESTIONS_SURFACE_SYSTEM + buildChatSystemPrompt({ surfaceExtension })
 * - File import: FILE_IMPORT_SURFACE_SYSTEM + buildChatSystemPrompt({ surfaceExtension })
 */

export { joinPromptSections } from "./compose";
export {
  buildChatAnthropicRequest,
  buildChatSystemPrompt,
  buildChatUserContent,
} from "./chat";
export {
  buildSearchAnthropicRequest,
  buildSearchSystemPrompt,
  buildSearchUserContent,
} from "./search";
export type { BuildSearchSystemOptions } from "./search";
export { buildSearchToolsSystemPrompt } from "./search-agent";
export {
  buildSearchReconciliationSystemPrompt,
  buildSearchReconciliationUserContent,
} from "./search-reconcile";
export {
  buildVoiceAnthropicRequest,
  buildVoiceSystemPrompt,
  buildVoiceUserContent,
} from "./voice-input";
export type { BuildVoiceSystemOptions } from "./voice-input";
export {
  buildSurfacesSystemAddendum,
  REX_VOICE_LLM_ADDENDUM,
} from "./surfaces";
export { SUGGESTIONS_SURFACE_SYSTEM } from "./suggestions";
export { FILE_IMPORT_SURFACE_SYSTEM } from "./file-import";
export { REX_PERSONA_CORE } from "./persona";
export {
  buildQuickCaptureSystemPrompt,
  buildQuickCaptureTextUserContent,
  buildQuickCaptureDocumentUserPreamble,
  parseQuickCaptureDraft,
  type QuickCaptureDraft,
} from "./quick-capture";
export type {
  AnthropicMessageRole,
  AnthropicTextMessage,
  RexAnthropicRequest,
} from "./types";
