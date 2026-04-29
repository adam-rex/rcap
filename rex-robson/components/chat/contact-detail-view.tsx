"use client";

import {
  ArrowLeft,
  Download,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";
import {
  INTERNAL_CONTACT_OWNERS,
  isInternalContactOwner,
} from "@/lib/constants/internal-contact-owners";
import { HOME_CONTACTS_HREF } from "@/components/chat/chat-nav-config";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
} from "./workspace-create-dialog";

type ContactDetail = {
  phone: string | null;
  email: string | null;
  notes: string | null;
  organisationId: string | null;
};

type ContactDocument = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

type ContactDocumentApiRow = {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type ContactComment = {
  id: string;
  body: string;
  createdAt: string;
};

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type ContactDetailViewProps = {
  contact: WorkspaceContactPageRow;
  /** When provided, seeds phone/email/notes before the first fetch completes. */
  prefetchedFields?: Pick<ContactDetail, "phone" | "email" | "notes"> | null;
  refreshTick: number;
  /** Full-page layout vs inline panel in Rex shell. */
  layout?: "panel" | "page";
  onBack: () => void;
  onEdit: () => void;
  onAdd: () => void;
  onDeleted: () => void;
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Label : value; always rendered — use emptyLabel when value is blank. */
function MetaItem({
  label,
  value,
  href,
  emptyLabel = "—",
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  emptyLabel?: string;
}) {
  const hasValue = value != null && String(value).trim().length > 0;
  const display = hasValue ? String(value).trim() : null;
  const text = display ?? emptyLabel;
  const isPlaceholder = display == null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/75">
        {label}
      </span>
      {href && display ? (
        <a
          href={href}
          className="truncate text-xs text-charcoal underline-offset-2 hover:underline"
        >
          {display}
        </a>
      ) : (
        <span
          className={`truncate text-xs ${
            isPlaceholder ? "text-charcoal-light/65" : "text-charcoal"
          }`}
        >
          {text}
        </span>
      )}
    </div>
  );
}

export function ContactDetailView({
  contact,
  prefetchedFields,
  refreshTick,
  layout = "panel",
  onBack,
  onEdit,
  onAdd,
  onDeleted,
}: ContactDetailViewProps) {
  const isPage = layout === "page";
  const [detail, setDetail] = useState<ContactDetail | null>(() =>
    prefetchedFields
      ? {
          phone: prefetchedFields.phone,
          email: prefetchedFields.email,
          notes: prefetchedFields.notes,
          organisationId: contact.organisation_id,
        }
      : null,
  );
  const [loading, setLoading] = useState(!prefetchedFields);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [notesDraft, setNotesDraft] = useState(
    prefetchedFields?.notes ?? "",
  );
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
  const [notesDirty, setNotesDirty] = useState(false);

  const [comments, setComments] = useState<ContactComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const loadDocuments = async (signal?: AbortSignal) => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contact.id}/documents`, {
        signal,
      });
      const data = (await res.json()) as {
        rows?: ContactDocumentApiRow[];
        error?: string;
        hint?: string;
      };
      if (signal?.aborted) return;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setDocsError(
          parts.length > 0 ? parts.join(" ") : "Could not load documents.",
        );
        setDocuments([]);
        return;
      }
      const rows = data.rows ?? [];
      setDocuments(
        rows.map((r) => ({
          id: r.id,
          filename: r.filename,
          contentType: r.content_type,
          sizeBytes: r.size_bytes,
          createdAt: r.created_at,
        })),
      );
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setDocsError("Network error while loading documents.");
      setDocuments([]);
    } finally {
      if (!signal?.aborted) setDocsLoading(false);
    }
  };

  const loadComments = async (signal?: AbortSignal) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contact.id}/comments`, {
        signal,
      });
      const data = (await res.json()) as {
        rows?: { id: string; body: string; createdAt: string }[];
        error?: string;
      };
      if (signal?.aborted) return;
      if (!res.ok) {
        setCommentsError(data.error ?? "Could not load comments.");
        setComments([]);
        return;
      }
      setComments(
        (data.rows ?? []).map((r) => ({
          id: r.id,
          body: r.body,
          createdAt: r.createdAt,
        })),
      );
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setCommentsError("Network error while loading comments.");
      setComments([]);
    } finally {
      if (!signal?.aborted) setCommentsLoading(false);
    }
  };

  const handleUploadClick = () => {
    if (uploading) return;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(
        `/api/workspace/contacts/${contact.id}/documents`,
        {
          method: "POST",
          body: fd,
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setUploadError(
          parts.length > 0 ? parts.join(" ") : "Upload failed.",
        );
        return;
      }
      await loadDocuments();
    } catch {
      setUploadError("Network error while uploading.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveDocument = async (documentId: string) => {
    if (removingDocId) return;
    const target = documents.find((d) => d.id === documentId);
    const confirmed = window.confirm(
      `Remove ${target?.filename ?? "this document"}?`,
    );
    if (!confirmed) return;
    setRemovingDocId(documentId);
    setUploadError(null);
    try {
      const res = await fetch(
        `/api/workspace/contacts/${contact.id}/documents/${documentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setUploadError(data.error ?? "Could not remove document.");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch {
      setUploadError("Network error while removing document.");
    } finally {
      setRemovingDocId(null);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    const confirmed = window.confirm(
      `Delete ${contact.name}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contact.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res
          .json()
          .catch(() => ({}))) as { error?: string; hint?: string };
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setDeleteError(
          parts.length > 0 ? parts.join(" ") : "Could not delete contact.",
        );
        setDeleting(false);
        return;
      }
      onDeleted();
    } catch {
      setDeleteError("Network error while deleting contact.");
      setDeleting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/workspace/contacts/${contact.id}`);
        const data = (await res.json()) as {
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          organisationId?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load contact.");
          setDetail(null);
          return;
        }
        setDetail({
          phone: data.phone ?? null,
          email: data.email ?? null,
          notes: data.notes ?? null,
          organisationId: data.organisationId ?? null,
        });
        setNotesDraft(data.notes ?? "");
        setNotesDirty(false);
      } catch {
        if (!cancelled) {
          setError("Network error while loading contact.");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contact.id, refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    void loadComments(controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, refreshTick]);

  const saveNotes = async () => {
    if (notesSaving || loading) return;
    setNotesSaving(true);
    setNotesSaveError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          contactType: contact.contact_type ?? "",
          sector: contact.sector ?? "",
          organisationId: contact.organisation_id,
          role: contact.role,
          geography: contact.geography,
          phone: detail?.phone ?? null,
          email: detail?.email ?? null,
          notes: notesDraft.trim() === "" ? null : notesDraft.trim(),
          internalOwner:
            contact.internal_owner == null ||
            contact.internal_owner.trim() === ""
              ? null
              : isInternalContactOwner(contact.internal_owner)
                ? contact.internal_owner
                : INTERNAL_CONTACT_OWNERS[0],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setNotesSaveError(
          parts.length > 0 ? parts.join(" ") : "Could not save notes.",
        );
        return;
      }
      setDetail((d) =>
        d ? { ...d, notes: notesDraft.trim() === "" ? null : notesDraft.trim() } : d,
      );
      setNotesDirty(false);
    } catch {
      setNotesSaveError("Network error while saving notes.");
    } finally {
      setNotesSaving(false);
    }
  };

  const postComment = async () => {
    const body = newComment.trim();
    if (body === "" || postingComment) return;
    setPostingComment(true);
    setCommentsError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contact.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        createdAt?: string;
      };
      if (!res.ok) {
        setCommentsError(data.error ?? "Could not post comment.");
        return;
      }
      if (data.id && data.createdAt != null) {
        setComments((prev) => [
          {
            id: data.id!,
            body,
            createdAt: String(data.createdAt),
          },
          ...prev,
        ]);
      }
      setNewComment("");
    } catch {
      setCommentsError("Network error while posting comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const subline = [contact.role, contact.organisation_name]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" · ");

  const contactTypeTrimmed = (contact.contact_type ?? "").trim();
  const typeBadge =
    contactTypeTrimmed.length > 0 ? contactTypeTrimmed : "Not set";

  const shellClass = isPage
    ? "min-h-dvh w-full max-w-[100%] overflow-x-hidden bg-cream pb-10 pt-[env(safe-area-inset-top,0px)]"
    : "flex min-w-0 w-full flex-col";

  const innerClass = isPage
    ? "mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-8"
    : "flex min-w-0 w-full max-w-full flex-col px-4 py-6 sm:px-8";

  const BackControl = isPage ? (
    <Link
      href={HOME_CONTACTS_HREF}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-charcoal-light transition-colors hover:bg-charcoal/5 hover:text-charcoal"
    >
      <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
      Contacts
    </Link>
  ) : (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-charcoal-light transition-colors hover:bg-charcoal/5 hover:text-charcoal"
    >
      <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
      Contacts
    </button>
  );

  return (
    <div className={shellClass}>
      <div className={innerClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {BackControl}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
            >
              <Plus className="size-3.5" aria-hidden />
              Add contact
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-xs font-medium text-charcoal transition-colors hover:bg-cream-light"
            >
              <Pencil className="size-3.5" aria-hidden />
              Edit details
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-700/20 bg-cream px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="size-3.5" aria-hidden />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {deleteError ? (
          <p className="mt-3 text-sm text-red-700/90" role="alert">
            {deleteError}
          </p>
        ) : null}

        {/* Compact identity + metrics strip */}
        <div className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream-light/50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800 sm:size-11 sm:text-sm">
              {initials(contact.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-lg font-normal tracking-tight text-charcoal sm:text-xl">
                  {contact.name}
                </h2>
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-charcoal/12 bg-cream px-2 py-0.5 text-[11px] font-medium text-charcoal shadow-[0_1px_0_rgba(10,10,10,0.04)]"
                  title="Contact type"
                >
                  <Tag className="size-3 shrink-0 text-charcoal/65" aria-hidden />
                  {typeBadge}
                </span>
              </div>
              {subline ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/90">
                  {subline}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-charcoal-light/65">—</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-charcoal/[0.06] pt-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <MetaItem
              label="Organisation"
              value={contact.organisation_name}
            />
            <MetaItem label="Role" value={contact.role} />
            <MetaItem label="Sector" value={contact.sector} />
            <MetaItem label="Geography" value={contact.geography} />
            <MetaItem
              label="Org type"
              value={contact.organisation_type}
            />
            <MetaItem
              label="Last contact"
              value={
                contact.last_contact_date
                  ? formatDate(contact.last_contact_date)
                  : null
              }
            />
            <MetaItem
              label="Rex team"
              value={contact.internal_owner}
            />
            <MetaItem
              label="Phone"
              value={loading ? "…" : detail?.phone ?? null}
              href={
                !loading && detail?.phone
                  ? `tel:${detail.phone.replace(/\s+/g, "")}`
                  : undefined
              }
            />
            <MetaItem
              label="Email"
              value={loading ? "…" : detail?.email ?? null}
              href={
                !loading && detail?.email ? `mailto:${detail.email}` : undefined
              }
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-700/90" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className={`mt-8 grid gap-8 ${isPage ? "lg:grid-cols-2 lg:items-start" : ""}`}
        >
          <div className="flex min-h-0 flex-col gap-8">
            <section>
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                <UserCircle2 className="size-3.5 opacity-70" aria-hidden />
                Notes
              </h3>
              <p className="mt-1 text-xs text-charcoal-light/80">
                Long-form context for this relationship — saved separately from
                quick comments below.
              </p>
              <div className="mt-3 rounded-lg border border-charcoal/[0.08] bg-cream-light/40 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/75">
                  On file
                </p>
                <p className="mt-1 min-h-[3rem] whitespace-pre-wrap text-sm leading-relaxed text-charcoal">
                  {loading
                    ? "…"
                    : (detail?.notes ?? "").trim() !== ""
                      ? detail?.notes ?? ""
                      : "Not set"}
                </p>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => {
                  setNotesDraft(e.target.value);
                  setNotesDirty(true);
                }}
                rows={isPage ? 12 : 8}
                disabled={loading}
                className={`${WORKSPACE_FORM_INPUT_CLASS} mt-3 min-h-[12rem] resize-y font-sans leading-relaxed`}
                placeholder="Background, thesis, intro history, follow-ups…"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!notesDirty || notesSaving || loading}
                  onClick={() => void saveNotes()}
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                >
                  {notesSaving ? "Saving…" : "Save notes"}
                </button>
                {notesDirty ? (
                  <span className="text-xs text-charcoal-light/75">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
              {notesSaveError ? (
                <p className="mt-2 text-xs text-red-700/90" role="alert">
                  {notesSaveError}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                <MessageSquare className="size-3.5 opacity-70" aria-hidden />
                Comments
              </h3>
              <p className="mt-1 text-xs text-charcoal-light/80">
                Short timestamped notes for your team on this contact.
              </p>
              <div className="mt-3 rounded-xl border border-charcoal/[0.08] bg-cream-light/30 p-3">
                <label className={WORKSPACE_FORM_LABEL_CLASS} htmlFor="contact-new-comment">
                  New comment
                </label>
                <textarea
                  id="contact-new-comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                  placeholder="Add a comment…"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      newComment.trim() === "" || postingComment
                    }
                    onClick={() => void postComment()}
                    className={WORKSPACE_FORM_BTN_PRIMARY}
                  >
                    {postingComment ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </div>
              {commentsError ? (
                <p className="mt-2 text-xs text-red-700/90" role="alert">
                  {commentsError}
                </p>
              ) : null}
              <ul className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
                {commentsLoading ? (
                  <li className="text-sm text-charcoal-light/70">
                    Loading comments…
                  </li>
                ) : comments.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-charcoal/12 bg-cream-light/20 px-3 py-6 text-center text-sm text-charcoal-light/80">
                    No comments yet.
                  </li>
                ) : (
                  comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-charcoal/[0.06] bg-cream-light/40 px-3 py-2.5"
                    >
                      <p className="text-[11px] text-charcoal-light/80">
                        {formatDateTime(c.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal">
                        {c.body}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          <section className="min-h-0">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                <FileText className="size-3.5 opacity-70" aria-hidden />
                Documents
              </h3>
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={uploading}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-charcoal/15 bg-cream px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-cream-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="size-3.5" strokeWidth={1.75} aria-hidden />
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
            <p className="mt-1 text-xs text-charcoal-light/80">
              PDFs, decks, term sheets — stored with this contact.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />

            {uploadError ? (
              <p className="mt-2 text-xs text-red-700/90" role="alert">
                {uploadError}
              </p>
            ) : null}
            {docsError ? (
              <p className="mt-2 text-xs text-red-700/90" role="alert">
                {docsError}
              </p>
            ) : null}

            <div className="mt-3">
              {docsLoading ? (
                <div className="flex min-h-[8rem] items-start gap-3 rounded-xl border border-dashed border-charcoal/15 bg-cream-light/30 p-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
                    <FileText className="size-4" strokeWidth={1.5} aria-hidden />
                  </span>
                  <p className="text-sm text-charcoal-light/70">Loading documents…</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="flex min-h-[10rem] items-start gap-3 rounded-xl border border-dashed border-charcoal/15 bg-cream-light/30 p-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
                    <FileText className="size-4" strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-charcoal">
                      No documents yet
                    </p>
                    <p className="mt-1 text-xs text-charcoal-light/80">
                      Upload files to build this contact&rsquo;s record.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
                  {documents.map((doc) => {
                    const meta = [formatBytes(doc.sizeBytes), formatDate(doc.createdAt)]
                      .filter((x) => x.length > 0 && x !== "—")
                      .join(" · ");
                    const removing = removingDocId === doc.id;
                    return (
                      <li
                        key={doc.id}
                        className="flex items-center gap-3 rounded-xl border border-charcoal/[0.08] bg-cream-light/40 px-4 py-3"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
                          <FileText className="size-4" strokeWidth={1.5} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={`/api/workspace/contacts/${contact.id}/documents/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-sm font-medium text-charcoal underline-offset-2 hover:underline"
                          >
                            {doc.filename}
                          </a>
                          {meta ? (
                            <p className="mt-0.5 truncate text-xs text-charcoal-light/80">
                              {meta}
                            </p>
                          ) : null}
                        </div>
                        <a
                          href={`/api/workspace/contacts/${contact.id}/documents/${doc.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-charcoal-light transition-colors hover:bg-charcoal/5 hover:text-charcoal"
                          aria-label={`Download ${doc.filename}`}
                          title="Download"
                        >
                          <Download className="size-4" strokeWidth={1.75} aria-hidden />
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleRemoveDocument(doc.id)}
                          disabled={removing}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-charcoal-light transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Remove ${doc.filename}`}
                          title="Remove"
                        >
                          <X className="size-4" strokeWidth={1.75} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
