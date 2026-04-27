import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  CONTACT_DOCUMENTS_BUCKET,
  insertContactDocument,
  listContactDocuments,
  safeContactDocumentSegment,
} from "@/lib/data/contact-documents";
import {
  fetchWorkspaceContactById,
  getWorkspaceWriteClient,
} from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

const MAX_DOC_BYTES = 25 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const rows = await listContactDocuments(client, id);
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET contact documents:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "If contact_documents is missing, apply migration 20260427120000_contact_documents.sql.",
      },
      { status: 503 },
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read form data" },
      { status: 400 },
    );
  }

  const entry = form.get("file");
  if (!(entry instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' in upload" },
      { status: 400 },
    );
  }
  if (entry.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (entry.size > MAX_DOC_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${Math.round(MAX_DOC_BYTES / (1024 * 1024))}MB limit` },
      { status: 413 },
    );
  }

  try {
    const client = await getWorkspaceWriteClient();
    const contact = await fetchWorkspaceContactById(client, id);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const safeName = safeContactDocumentSegment(entry.name || "file");
    const objectId = crypto.randomUUID();
    const storagePath = `${id}/${objectId}-${safeName}`;
    const buf = Buffer.from(await entry.arrayBuffer());

    const { error: upErr } = await client.storage
      .from(CONTACT_DOCUMENTS_BUCKET)
      .upload(storagePath, buf, {
        contentType: entry.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      if (process.env.NODE_ENV === "development") {
        console.error("[rex-robson] document upload failed:", upErr.message);
      }
      return NextResponse.json(
        {
          error: upErr.message,
          hint:
            "If the bucket is missing, apply migration 20260427120000_contact_documents.sql.",
        },
        { status: 503 },
      );
    }

    let row;
    try {
      row = await insertContactDocument(client, {
        contact_id: id,
        filename: entry.name || safeName,
        content_type: entry.type || null,
        size_bytes: entry.size,
        storage_bucket: CONTACT_DOCUMENTS_BUCKET,
        storage_path: storagePath,
      });
    } catch (insertErr) {
      await client.storage
        .from(CONTACT_DOCUMENTS_BUCKET)
        .remove([storagePath])
        .catch(() => undefined);
      throw insertErr;
    }

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] POST contact documents:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "Set SUPABASE_SERVICE_ROLE_KEY or sign in. Apply migration 20260427120000_contact_documents.sql for the table + bucket.",
      },
      { status: 503 },
    );
  }
}
