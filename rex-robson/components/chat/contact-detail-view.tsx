"use client";

import {
  ArrowLeft,
  Building2,
  FileText,
  Globe2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Tag,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";

type ContactDetail = {
  phone: string | null;
  email: string | null;
  notes: string | null;
  organisationId: string | null;
};

type ContactDetailViewProps = {
  contact: WorkspaceContactPageRow;
  refreshTick: number;
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

type InfoRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
};

function InfoRow({ icon, label, value, href }: InfoRowProps) {
  const display = value && value.trim().length > 0 ? value : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-charcoal/[0.08] bg-cream-light/40 px-4 py-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
          {label}
        </p>
        {display == null ? (
          <p className="mt-0.5 text-sm text-charcoal-light/60">—</p>
        ) : href ? (
          <a
            href={href}
            className="mt-0.5 block break-words text-sm text-charcoal underline-offset-2 hover:underline"
          >
            {display}
          </a>
        ) : (
          <p className="mt-0.5 break-words text-sm text-charcoal">{display}</p>
        )}
      </div>
    </div>
  );
}

export function ContactDetailView({
  contact,
  refreshTick,
  onBack,
  onEdit,
  onAdd,
  onDeleted,
}: ContactDetailViewProps) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const subline = [contact.role, contact.organisation_name, contact.geography]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" · ");

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-charcoal-light transition-colors hover:bg-charcoal/5 hover:text-charcoal"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
          Contacts
        </button>
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
            Edit contact
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-700/20 bg-cream px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {deleting ? "Deleting…" : "Delete contact"}
          </button>
        </div>
      </div>

      {deleteError ? (
        <p className="mt-3 text-sm text-red-700/90" role="alert">
          {deleteError}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-4 rounded-xl border border-charcoal/[0.08] bg-cream-light/60 p-5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
          {initials(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-2xl tracking-tight text-charcoal">
            {contact.name}
          </h2>
          {subline ? (
            <p className="mt-1 truncate text-sm text-charcoal-light/90">
              {subline}
            </p>
          ) : null}
          {contact.organisation_type ? (
            <span className="mt-2 inline-block rounded-full border border-charcoal/10 bg-cream-light px-2 py-0.5 text-xs text-charcoal-light">
              {contact.organisation_type}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-700/90" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
          Overview
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow
            icon={<Tag className="size-3.5" strokeWidth={1.75} aria-hidden />}
            label="Contact type"
            value={contact.contact_type}
          />
          <InfoRow
            icon={<Tag className="size-3.5" strokeWidth={1.75} aria-hidden />}
            label="Sector"
            value={contact.sector}
          />
          <InfoRow
            icon={
              <Building2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            }
            label="Organisation"
            value={contact.organisation_name}
          />
          <InfoRow
            icon={
              <UserCircle2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            }
            label="Role"
            value={contact.role}
          />
          <InfoRow
            icon={
              <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden />
            }
            label="Geography"
            value={contact.geography}
          />
          <InfoRow
            icon={
              <Globe2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            }
            label="Last contact"
            value={formatDate(contact.last_contact_date)}
          />
          <InfoRow
            icon={<Phone className="size-3.5" strokeWidth={1.75} aria-hidden />}
            label="Phone"
            value={loading ? "…" : detail?.phone ?? null}
            href={
              !loading && detail?.phone
                ? `tel:${detail.phone.replace(/\s+/g, "")}`
                : undefined
            }
          />
          <InfoRow
            icon={<Mail className="size-3.5" strokeWidth={1.75} aria-hidden />}
            label="Email"
            value={loading ? "…" : detail?.email ?? null}
            href={
              !loading && detail?.email ? `mailto:${detail.email}` : undefined
            }
          />
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
          Notes
        </h3>
        <div className="mt-3 rounded-xl border border-charcoal/[0.08] bg-cream-light/40 p-4">
          {loading ? (
            <p className="text-sm text-charcoal-light/70">Loading notes…</p>
          ) : detail?.notes && detail.notes.trim().length > 0 ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-charcoal">
              {detail.notes}
            </p>
          ) : (
            <p className="text-sm text-charcoal-light/70">No notes yet.</p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
          Supporting documents
        </h3>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed border-charcoal/15 bg-cream-light/30 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
            <FileText className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-charcoal">
              No documents yet
            </p>
            <p className="mt-1 text-xs text-charcoal-light/80">
              Attach PDFs or notes from Ask Rex to build this contact&rsquo;s file.
              Document linking per contact is coming soon.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
