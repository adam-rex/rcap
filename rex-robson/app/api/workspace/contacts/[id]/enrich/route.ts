import { NextResponse } from "next/server";
import { isValidUuid, readJsonObject } from "@/lib/api/workspace-post-parse";
import {
  buildContactEnrichSystemPrompt,
  buildContactEnrichUserText,
  type ContactEnrichContextContact,
} from "@/lib/prompts/contact-enrich";
import type {
  AnthropicContentBlock,
  AnthropicTextMessage,
} from "@/lib/prompts/types";
import { fetchContactDocumentById } from "@/lib/data/contact-documents";
import {
  fetchWorkspaceContactById,
  getWorkspaceWriteClient,
} from "@/lib/data/workspace-mutations";
import { fetchPublicPageText } from "@/lib/rex/fetch-public-page-text";
import { completeAnthropicMessage } from "@/lib/rex/anthropic-messages";

export const runtime = "nodejs";

const MAX_ENRICH_PDFS = 4;
const MAX_DOC_BYTES = 25 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

type SuggestionPayload = {
  current: unknown;
  suggested: unknown;
  source: "website" | "pdf" | "both";
};

type EnrichSuggestionsOut = Record<string, SuggestionPayload>;

function isPdfContentType(contentType: string | null, filename: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/pdf")) return true;
  return filename.toLowerCase().endsWith(".pdf");
}

function coerceNumeric(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function coerceStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      out.push(item.trim());
    }
  }
  return out.length > 0 ? out : null;
}

function normString(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function stringsLooselyEqual(a: string, b: string): boolean {
  return normString(a) === normString(b);
}

function sortedNormStrings(arr: string[] | null): string[] {
  return [...(arr ?? [])].map(normString).filter((x) => x.length > 0).sort();
}

function stringArraysLooselyEqual(a: string[] | null, b: string[] | null): boolean {
  const aa = sortedNormStrings(a);
  const bb = sortedNormStrings(b);
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

function numbersEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-6;
}
function unchangedVsCurrent(
  field: string,
  suggested: unknown,
  row: ContactEnrichContextContact,
): boolean {
  switch (field) {
    case "sector":
    case "role":
    case "geography":
    case "notes":
      return stringsLooselyEqual(coerceString(suggested), coerceString(row[field]));
    case "deal_types": {
      const sug = coerceStringArray(suggested);
      return stringArraysLooselyEqual(sug, row.deal_types);
    }
    case "min_deal_size":
    case "max_deal_size":
      return numbersEqual(coerceNumeric(suggested), row[field]);
    default:
      return true;
  }
}

function parseEnrichModelJson(raw: string): {
  suggestions: Record<string, unknown>;
  reasoning: string;
} | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const suggestionsRaw = obj.suggestions;
    const reasoning = coerceString(obj.reasoning);
    if (suggestionsRaw != null && typeof suggestionsRaw !== "object") return null;
    const suggestions =
      suggestionsRaw == null || Array.isArray(suggestionsRaw)
        ? {}
        : { ...(suggestionsRaw as Record<string, unknown>) };
    return { suggestions, reasoning };
  } catch {
    return null;
  }
}

function shapeSuggestionValue(field: string, value: unknown): unknown {
  switch (field) {
    case "sector":
    case "role":
    case "geography":
    case "notes":
      return coerceString(value);
    case "deal_types":
      return coerceStringArray(value) ?? [];
    case "min_deal_size":
    case "max_deal_size":
      return coerceNumeric(value);
    default:
      return value;
  }
}

function snapshotFromRow(
  row: NonNullable<Awaited<ReturnType<typeof fetchWorkspaceContactById>>>,
): ContactEnrichContextContact {
  return {
    name: row.name,
    contact_type: row.contact_type,
    organisation_name: row.organisation_name,
    sector: row.sector,
    role: row.role,
    geography: row.geography,
    notes: row.notes,
    deal_types: row.deal_types,
    min_deal_size: row.min_deal_size,
    max_deal_size: row.max_deal_size,
    email: row.email,
    phone: row.phone,
  };
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsedBody = await readJsonObject(req);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }

  const websiteUrlRaw = parsedBody.body["websiteUrl"];
  const attachmentIdsRaw = parsedBody.body["attachmentIds"];

  const websiteUrl =
    typeof websiteUrlRaw === "string" ? websiteUrlRaw.trim() : "";
  const attachmentIds: string[] = [];
  if (Array.isArray(attachmentIdsRaw)) {
    for (const x of attachmentIdsRaw) {
      if (typeof x === "string" && isValidUuid(x.trim())) {
        attachmentIds.push(x.trim());
      }
    }
  }

  if (websiteUrl === "" && attachmentIds.length === 0) {
    return NextResponse.json(
      { error: "Provide websiteUrl and/or attachmentIds" },
      { status: 400 },
    );
  }

  try {
    const client = await getWorkspaceWriteClient();
    const row = await fetchWorkspaceContactById(client, id);
    if (!row) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const snapshot = snapshotFromRow(row);

    let websiteExcerpt: string | null = null;
    if (websiteUrl !== "") {
      const page = await fetchPublicPageText(websiteUrl);
      if (page.ok) {
        websiteExcerpt = page.text;
      }
    }

    const pdfBlocks: AnthropicContentBlock[] = [];
    const seenDoc = new Set<string>();
    for (const docId of attachmentIds) {
      if (pdfBlocks.length >= MAX_ENRICH_PDFS) break;
      if (seenDoc.has(docId)) continue;
      seenDoc.add(docId);

      const meta = await fetchContactDocumentById(client, id, docId);
      if (!meta) {
        return NextResponse.json(
          { error: `Document not found: ${docId}` },
          { status: 404 },
        );
      }
      if (!isPdfContentType(meta.content_type, meta.filename)) {
        return NextResponse.json(
          { error: `Not a PDF attachment: ${meta.filename}` },
          { status: 400 },
        );
      }

      const { data: fileData, error: dlErr } = await client.storage
        .from(meta.storage_bucket)
        .download(meta.storage_path);

      if (dlErr || !fileData) {
        const msg = dlErr?.message ?? "Could not download attachment";
        return NextResponse.json({ error: msg }, { status: 503 });
      }

      const buf = Buffer.from(await fileData.arrayBuffer());
      if (buf.length === 0) {
        return NextResponse.json(
          { error: `Empty file: ${meta.filename}` },
          { status: 400 },
        );
      }
      if (buf.length > MAX_DOC_BYTES) {
        return NextResponse.json(
          { error: `PDF too large: ${meta.filename}` },
          { status: 413 },
        );
      }

      pdfBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buf.toString("base64"),
        },
        title: meta.filename,
      });
    }

    const usedWebsite = websiteExcerpt != null && websiteExcerpt.length > 0;
    const usedPdf = pdfBlocks.length > 0;

    if (!usedWebsite && !usedPdf) {
      return NextResponse.json(
        {
          error:
            "No usable sources: website fetch failed or produced no text, and no PDFs were provided.",
        },
        { status: 400 },
      );
    }

    const enrichSource: "website" | "pdf" | "both" = usedWebsite && usedPdf
      ? "both"
      : usedWebsite
        ? "website"
        : "pdf";

    const userText = buildContactEnrichUserText({
      contact: snapshot,
      websiteExcerpt: usedWebsite ? websiteExcerpt : null,
    });

    const contentBlocks: AnthropicContentBlock[] = [
      ...pdfBlocks,
      { type: "text", text: userText },
    ];

    const messages: AnthropicTextMessage[] = [
      { role: "user", content: contentBlocks },
    ];

    const raw = await completeAnthropicMessage({
      system: buildContactEnrichSystemPrompt(),
      messages,
      maxTokens: 2048,
    });

    const parsed = parseEnrichModelJson(raw);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Could not parse model response",
          raw: raw.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const ALLOWED = new Set([
      "sector",
      "deal_types",
      "min_deal_size",
      "max_deal_size",
      "geography",
      "notes",
      "role",
    ]);

    const outSuggestions: EnrichSuggestionsOut = {};

    for (const key of Object.keys(parsed.suggestions)) {
      if (!ALLOWED.has(key)) continue;
      const rawVal = parsed.suggestions[key];
      if (rawVal === undefined) continue;

      const shaped = shapeSuggestionValue(key, rawVal);

      if (
        (key === "sector" ||
          key === "role" ||
          key === "geography" ||
          key === "notes") &&
        coerceString(shaped) === ""
      ) {
        continue;
      }
      if (key === "deal_types" && (!Array.isArray(shaped) || shaped.length === 0)) {
        continue;
      }
      if (
        (key === "min_deal_size" || key === "max_deal_size") &&
        coerceNumeric(shaped) == null
      ) {
        continue;
      }

      if (unchangedVsCurrent(key, shaped, snapshot)) continue;

      const currentVal =
        key === "deal_types"
          ? snapshot.deal_types
          : key === "min_deal_size"
            ? snapshot.min_deal_size
            : key === "max_deal_size"
              ? snapshot.max_deal_size
              : snapshot[key as "sector" | "role" | "geography" | "notes"];

      outSuggestions[key] = {
        current: currentVal ?? null,
        suggested: shaped,
        source: enrichSource,
      };
    }

    const reasoning =
      coerceString(parsed.reasoning).length > 0
        ? coerceString(parsed.reasoning)
        : "Model returned empty reasoning.";

    return NextResponse.json({
      suggestions: outSuggestions,
      reasoning,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Enrich failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST /api/workspace/contacts/[id]/enrich:", e);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
