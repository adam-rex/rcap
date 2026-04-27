import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTACT_DOCUMENTS_BUCKET = "contact-documents";

export type ContactDocumentRow = {
  id: string;
  contact_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
};

const SELECT_COLS =
  "id,contact_id,filename,content_type,size_bytes,storage_bucket,storage_path,created_at";

function shapeRow(data: Record<string, unknown>): ContactDocumentRow {
  return {
    id: String(data.id),
    contact_id: String(data.contact_id),
    filename: String(data.filename ?? ""),
    content_type: data.content_type == null ? null : String(data.content_type),
    size_bytes:
      typeof data.size_bytes === "number"
        ? data.size_bytes
        : data.size_bytes == null
          ? null
          : Number(data.size_bytes),
    storage_bucket: String(data.storage_bucket ?? CONTACT_DOCUMENTS_BUCKET),
    storage_path: String(data.storage_path ?? ""),
    created_at: String(data.created_at ?? ""),
  };
}

export async function listContactDocuments(
  client: SupabaseClient,
  contactId: string,
): Promise<ContactDocumentRow[]> {
  const { data, error } = await client
    .from("contact_documents")
    .select(SELECT_COLS)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => shapeRow(row as Record<string, unknown>));
}

export async function fetchContactDocumentById(
  client: SupabaseClient,
  contactId: string,
  documentId: string,
): Promise<ContactDocumentRow | null> {
  const { data, error } = await client
    .from("contact_documents")
    .select(SELECT_COLS)
    .eq("id", documentId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return shapeRow(data as Record<string, unknown>);
}

export async function insertContactDocument(
  client: SupabaseClient,
  input: {
    contact_id: string;
    filename: string;
    content_type: string | null;
    size_bytes: number | null;
    storage_bucket: string;
    storage_path: string;
  },
): Promise<ContactDocumentRow> {
  const { data, error } = await client
    .from("contact_documents")
    .insert({
      contact_id: input.contact_id,
      filename: input.filename,
      content_type: input.content_type,
      size_bytes: input.size_bytes,
      storage_bucket: input.storage_bucket,
      storage_path: input.storage_path,
    })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");
  return shapeRow(data as Record<string, unknown>);
}

export async function deleteContactDocument(
  client: SupabaseClient,
  contactId: string,
  documentId: string,
): Promise<ContactDocumentRow | null> {
  const { data, error } = await client
    .from("contact_documents")
    .delete()
    .eq("id", documentId)
    .eq("contact_id", contactId)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return shapeRow(data as Record<string, unknown>);
}

export function safeContactDocumentSegment(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "file"
  );
}
