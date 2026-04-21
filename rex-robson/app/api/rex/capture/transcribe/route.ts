import { getOpenAIApiKey, getOpenAIWhisperModel } from "@/lib/rex/openai-config";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  "webm",
  "mp3",
  "mp4",
  "m4a",
  "wav",
  "ogg",
  "oga",
  "flac",
]);

function filenameFromMime(mime: string, fallback: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("webm")) return `${fallback}.webm`;
  if (lower.includes("mpeg") || lower.includes("mp3")) return `${fallback}.mp3`;
  if (lower.includes("wav")) return `${fallback}.wav`;
  if (lower.includes("ogg") || lower.includes("opus")) return `${fallback}.ogg`;
  if (lower.includes("mp4") || lower.includes("m4a")) return `${fallback}.m4a`;
  if (lower.includes("flac")) return `${fallback}.flac`;
  return `${fallback}.webm`;
}

function extFromName(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return null;
  return name.slice(idx + 1).toLowerCase();
}

type TranscribeResponse =
  | { text: string }
  | { text?: string }
  | { error?: { message?: string } };

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  let audioBlob: Blob | null = null;
  let filename = "voice-note.webm";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const entry =
        form.get("audio") ??
        form.get("file") ??
        form.get("voice");
      if (!(entry instanceof File)) {
        return Response.json(
          { error: "audio file is required (field 'audio')" },
          { status: 400 },
        );
      }
      if (entry.size === 0) {
        return Response.json({ error: "Empty audio file" }, { status: 400 });
      }
      if (entry.size > MAX_AUDIO_BYTES) {
        return Response.json(
          { error: "Audio file is too large (>25MB)" },
          { status: 400 },
        );
      }
      audioBlob = entry;
      const ext = extFromName(entry.name);
      if (ext && ACCEPTED_EXTENSIONS.has(ext)) {
        filename = entry.name;
      } else {
        filename = filenameFromMime(entry.type ?? "", "voice-note");
      }
    } else if (contentType.startsWith("audio/")) {
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.byteLength === 0) {
        return Response.json({ error: "Empty audio body" }, { status: 400 });
      }
      if (buf.byteLength > MAX_AUDIO_BYTES) {
        return Response.json(
          { error: "Audio body is too large (>25MB)" },
          { status: 400 },
        );
      }
      audioBlob = new Blob([buf], { type: contentType });
      filename = filenameFromMime(contentType, "voice-note");
    } else {
      return Response.json(
        { error: "Send multipart/form-data with 'audio' or a raw audio/* body" },
        { status: 400 },
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const apiKey = getOpenAIApiKey();
    const model = getOpenAIWhisperModel();
    const upstream = new FormData();
    upstream.append("file", audioBlob, filename);
    upstream.append("model", model);
    upstream.append("response_format", "json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    const data = (await res.json()) as TranscribeResponse;
    if (!res.ok) {
      const message =
        ("error" in data && data.error?.message) || res.statusText;
      return Response.json(
        { error: message || "Transcription failed" },
        { status: 502 },
      );
    }
    const text = "text" in data && typeof data.text === "string" ? data.text : "";
    if (!text.trim()) {
      return Response.json(
        { error: "Transcription returned empty text" },
        { status: 502 },
      );
    }
    return Response.json({ transcript: text.trim() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
