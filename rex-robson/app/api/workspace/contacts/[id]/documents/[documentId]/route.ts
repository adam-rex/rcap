import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/api/workspace-post-parse";
import {
  deleteContactDocument,
  fetchContactDocumentById,
} from "@/lib/data/contact-documents";
import { getWorkspaceWriteClient } from "@/lib/data/workspace-mutations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; documentId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { id, documentId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(documentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const meta = await fetchContactDocumentById(client, id, documentId);
    if (!meta) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data, error } = await client.storage
      .from(meta.storage_bucket)
      .createSignedUrl(meta.storage_path, 120);

    if (error || !data?.signedUrl) {
      const msg = error?.message ?? "Could not create download link";
      if (process.env.NODE_ENV === "development") {
        console.error("[rex-robson] document signed URL:", error);
      }
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Download failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET contact document:", e);
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id, documentId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(documentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const client = await getWorkspaceWriteClient();
    const removed = await deleteContactDocument(client, id, documentId);
    if (!removed) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { error: storageErr } = await client.storage
      .from(removed.storage_bucket)
      .remove([removed.storage_path]);
    if (storageErr && process.env.NODE_ENV === "development") {
      console.warn(
        "[rex-robson] storage delete failed (row already removed):",
        storageErr.message,
      );
    }

    return NextResponse.json({ id: documentId, deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] DELETE contact document:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint: "Set SUPABASE_SERVICE_ROLE_KEY or sign in.",
      },
      { status: 503 },
    );
  }
}
