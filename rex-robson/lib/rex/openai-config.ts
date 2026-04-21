export function getOpenAIApiKey(): string {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
    "";
  if (!key) {
    throw new Error(
      "Missing OPENAI_API_KEY (or NEXT_PUBLIC_OPENAI_API_KEY for local dev only).",
    );
  }
  return key;
}

export function getOpenAIWhisperModel(): string {
  return process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
}
