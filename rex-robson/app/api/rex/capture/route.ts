import {
  buildQuickCaptureDocumentUserPreamble,
  buildQuickCaptureSystemPrompt,
  buildQuickCaptureTextUserContent,
  parseQuickCaptureDraft,
  type QuickCaptureDraft,
} from "@/lib/prompts/quick-capture";
import type {
  AnthropicContentBlock,
  AnthropicImageMediaType,
} from "@/lib/prompts/types";
import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";
import {
  fetchPublicPageTexts,
  formatFetchedPagesForPrompt,
} from "@/lib/rex/fetch-public-page-text";
import { normalizeImageForAnthropicVision } from "@/lib/rex/normalize-quick-capture-image";
import {
  parseWebsiteUrlInputs,
  QUICK_CAPTURE_FETCH_MAX_URLS,
} from "@/lib/rex/quick-capture-urls";

export const runtime = "nodejs";

const MAX_DOCS = 4;
const MAX_DOC_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;

type ExtractedAttachment =
  | { kind: "pdf"; title: string; base64: string }
  | {
      kind: "image";
      mediaType: AnthropicImageMediaType;
      base64: string;
      title: string;
    };

type Parsed =
  | { ok: true; text: string; attachments: ExtractedAttachment[]; urls: string[] }
  | { ok: false; error: string };

function dedupeUrlStrings(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function collectUrlsFromJson(body: Record<string, unknown>): string[] {
  const raw = body["urls"];
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) list.push(item.trim());
    }
  } else if (typeof raw === "string" && raw.trim()) {
    list.push(...parseWebsiteUrlInputs(raw));
  }
  return dedupeUrlStrings(list).slice(0, QUICK_CAPTURE_FETCH_MAX_URLS);
}

function collectUrlsFromForm(form: FormData): string[] {
  const list: string[] = [];
  for (const entry of form.getAll("url")) {
    if (typeof entry === "string" && entry.trim()) {
      list.push(...parseWebsiteUrlInputs(entry));
    }
  }
  const blob = form.get("urls");
  if (typeof blob === "string" && blob.trim()) {
    list.push(...parseWebsiteUrlInputs(blob));
  }
  return dedupeUrlStrings(list).slice(0, QUICK_CAPTURE_FETCH_MAX_URLS);
}

function detectImageMediaType(
  mime: string,
  name: string,
): AnthropicImageMediaType | null {
  const lower = name.toLowerCase();
  if (mime === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (mime === "image/png" || lower.endsWith(".png")) return "image/png";
  if (mime === "image/webp" || lower.endsWith(".webp")) return "image/webp";
  if (mime === "image/gif" || lower.endsWith(".gif")) return "image/gif";
  return null;
}

function isPdf(mime: string, name: string): boolean {
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

async function parseRequest(req: Request): Promise<Parsed> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const rawText = form.get("text");
    const text =
      typeof rawText === "string" ? rawText.slice(0, MAX_TEXT_CHARS) : "";
    const urls = collectUrlsFromForm(form);
    const entries: File[] = [];
    for (const key of ["documents", "images", "files"] as const) {
      for (const entry of form.getAll(key)) {
        if (entry instanceof File) entries.push(entry);
      }
    }
    const attachments: ExtractedAttachment[] = [];
    for (const entry of entries) {
      if (attachments.length >= MAX_DOCS) break;
      if (entry.size === 0 || entry.size > MAX_DOC_BYTES) continue;
      const buf = Buffer.from(await entry.arrayBuffer());
      const mime = entry.type ?? "";
      if (isPdf(mime, entry.name)) {
        attachments.push({
          kind: "pdf",
          title: entry.name,
          base64: buf.toString("base64"),
        });
        continue;
      }
      const imageMedia = detectImageMediaType(mime, entry.name);
      if (imageMedia) {
        const normalized = await normalizeImageForAnthropicVision(buf, imageMedia);
        attachments.push({
          kind: "image",
          mediaType: normalized.mediaType,
          base64: normalized.base64,
          title: entry.name,
        });
      }
    }
    return { ok: true, text, attachments, urls };
  }

  try {
    const body = (await req.json()) as {
      text?: unknown;
      urls?: unknown;
    };
    const text =
      typeof body.text === "string" ? body.text.slice(0, MAX_TEXT_CHARS) : "";
    const urls = collectUrlsFromJson(body as Record<string, unknown>);
    return { ok: true, text, attachments: [], urls };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

function buildUserContent(
  text: string,
  attachments: ExtractedAttachment[],
  fetchedPages?: string,
): AnthropicContentBlock[] | string {
  const pages = fetchedPages?.trim() || undefined;
  if (attachments.length === 0) {
    return buildQuickCaptureTextUserContent(text, { fetchedPages: pages });
  }
  const blocks: AnthropicContentBlock[] = [];
  for (const att of attachments) {
    if (att.kind === "pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: att.base64,
        },
        title: att.title,
      });
    } else {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType,
          data: att.base64,
        },
      });
    }
  }
  blocks.push({
    type: "text",
    text: buildQuickCaptureDocumentUserPreamble({
      text,
      documentCount: attachments.length,
      fetchedPages: pages,
    }),
  });
  return blocks;
}

export type QuickCaptureResponse = {
  draft: QuickCaptureDraft;
};

export async function POST(req: Request) {
  const parsed = await parseRequest(req);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { text, attachments, urls } = parsed;
  const hasInput =
    text.trim().length > 0 || attachments.length > 0 || urls.length > 0;
  if (!hasInput) {
    return Response.json(
      {
        error:
          "Send a note, attach a document/image, or add at least one https URL.",
      },
      { status: 400 },
    );
  }

  const pageResults = urls.length > 0 ? await fetchPublicPageTexts(urls) : [];
  const fetchedBlock = formatFetchedPagesForPrompt(pageResults);
  const anyPageOk = pageResults.some((r) => r.ok);
  const urlsOnly =
    text.trim().length === 0 && attachments.length === 0 && urls.length > 0;
  if (urlsOnly && !anyPageOk) {
    return Response.json(
      {
        error:
          "Could not fetch any of the URLs. Check that they are public https pages, then try again.",
      },
      { status: 400 },
    );
  }

  const fetchedPagesForPrompt =
    fetchedBlock.length > 0 ? fetchedBlock : undefined;

  try {
    const system = buildQuickCaptureSystemPrompt();
    const userContent = buildUserContent(
      text,
      attachments,
      fetchedPagesForPrompt,
    );

    const raw = await completeAnthropicMessage({
      system,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 1024,
    });

    const draft = parseQuickCaptureDraft(raw);
    if (!draft) {
      return Response.json(
        {
          error: "Could not parse model response",
          raw: raw.slice(0, 500),
        },
        { status: 502 },
      );
    }

    return Response.json({ draft } satisfies QuickCaptureResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Capture failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
