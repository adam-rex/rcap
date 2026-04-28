"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";
import { HOME_CONTACTS_HREF } from "@/components/chat/chat-nav-config";
import { ContactDetailView } from "./contact-detail-view";
import { ContactUpsertDialog } from "./contact-upsert-dialog";

type ContactApiRow = {
  id?: string;
  name?: string;
  contactType?: string | null;
  sector?: string | null;
  organisationId?: string | null;
  organisationName?: string | null;
  organisationType?: string | null;
  role?: string | null;
  geography?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  internalOwner?: string | null;
  lastContactDate?: string | null;
  error?: string;
};

function mapApiToPageRow(data: ContactApiRow): WorkspaceContactPageRow {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    contact_type: data.contactType ?? null,
    sector: data.sector ?? null,
    role: data.role ?? null,
    geography: data.geography ?? null,
    last_contact_date: data.lastContactDate ?? null,
    organisation_id: data.organisationId ?? null,
    organisation_name: data.organisationName ?? null,
    organisation_type: data.organisationType ?? null,
    internal_owner:
      data.internalOwner == null || data.internalOwner.trim() === ""
        ? null
        : data.internalOwner.trim(),
  };
}

export function ContactDetailRoute({ contactId }: { contactId: string }) {
  const router = useRouter();
  const firstLoadRef = useRef(true);
  const [contact, setContact] = useState<WorkspaceContactPageRow | null>(null);
  const [prefetchedFields, setPrefetchedFields] = useState<{
    phone: string | null;
    email: string | null;
    notes: string | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [upsertMode, setUpsertMode] = useState<"create" | "edit">("edit");

  useEffect(() => {
    firstLoadRef.current = true;
  }, [contactId]);

  const load = useCallback(async () => {
    const showFullLoader = firstLoadRef.current;
    if (showFullLoader) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const res = await fetch(`/api/workspace/contacts/${contactId}`);
      const data = (await res.json()) as ContactApiRow;
      if (!res.ok) {
        setContact(null);
        setPrefetchedFields(null);
        setLoadError(data.error ?? "Could not load this contact.");
        return;
      }
      setContact(mapApiToPageRow(data));
      setPrefetchedFields({
        phone: data.phone ?? null,
        email: data.email ?? null,
        notes: data.notes ?? null,
      });
    } catch {
      setContact(null);
      setPrefetchedFields(null);
      setLoadError("Network error while loading contact.");
    } finally {
      if (showFullLoader) {
        setLoading(false);
        firstLoadRef.current = false;
      }
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  if (loading && !contact) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <p className="text-sm text-charcoal-light">Loading contact…</p>
      </div>
    );
  }

  if (loadError != null || contact == null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-6">
        <p className="text-center text-sm text-red-700/90">{loadError}</p>
        <button
          type="button"
          onClick={() => router.push(HOME_CONTACTS_HREF)}
          className="rounded-lg border border-charcoal/15 bg-cream px-4 py-2 text-xs font-medium text-charcoal"
        >
          Back to contacts
        </button>
      </div>
    );
  }

  return (
    <>
      <ContactDetailView
        contact={contact}
        prefetchedFields={prefetchedFields}
        refreshTick={refreshTick}
        layout="page"
        onBack={() => router.push(HOME_CONTACTS_HREF)}
        onEdit={() => {
          setUpsertMode("edit");
          setUpsertOpen(true);
        }}
        onAdd={() => {
          setUpsertMode("create");
          setUpsertOpen(true);
        }}
        onDeleted={() => router.push(HOME_CONTACTS_HREF)}
      />
      <ContactUpsertDialog
        open={upsertOpen}
        onClose={() => setUpsertOpen(false)}
        mode={upsertMode}
        editingContact={upsertMode === "edit" ? contact : null}
        onSaved={() => setRefreshTick((n) => n + 1)}
        onAfterCreate={() => {
          router.push(HOME_CONTACTS_HREF);
        }}
      />
    </>
  );
}
