"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX,
  type WorkspaceOrganisationPageRow,
} from "@/lib/data/workspace-organisations-page.types";
import {
  INTERNAL_CONTACT_OWNERS,
  isInternalContactOwner,
} from "@/lib/constants/internal-contact-owners";
import type { WorkspaceContactPageRow } from "@/lib/data/workspace-contacts.types";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

/** Select value: create org via inline fields, then link contact. */
export const CONTACT_FORM_NEW_ORG_VALUE = "__new__";

export const CONTACT_TYPE_OPTIONS = [
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
] as const;

function isPdfAttachment(filename: string, contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/pdf")) return true;
  return filename.toLowerCase().endsWith(".pdf");
}

function formatDealTypesForInput(rows: string[] | null | undefined): string {
  if (!rows?.length) return "";
  return rows.join(", ");
}

function parseDealTypesFromInput(raw: string): string[] | null {
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : null;
}

function formatFieldLabel(field: string): string {
  switch (field) {
    case "deal_types":
      return "Deal types";
    case "min_deal_size":
      return "Min deal size";
    case "max_deal_size":
      return "Max deal size";
    default:
      return field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function formatSuggestionValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length ? value : "—";
  return String(value);
}

type ContactUpsertDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  /** Row used for edit mode (id + list fields); full payload loaded when dialog opens. */
  editingContact?: WorkspaceContactPageRow | null;
  onSaved: () => void;
  onAfterCreate?: () => void;
};

export function ContactUpsertDialog({
  open,
  onClose,
  mode,
  editingContact,
  onSaved,
  onAfterCreate,
}: ContactUpsertDialogProps) {
  const editingId = mode === "edit" ? editingContact?.id ?? null : null;

  const [detailLoading, setDetailLoading] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [orgOptions, setOrgOptions] = useState<WorkspaceOrganisationPageRow[]>(
    [],
  );
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrganisationId, setNewOrganisationId] = useState("");
  const [inlineNewOrgName, setInlineNewOrgName] = useState("");
  const [inlineNewOrgType, setInlineNewOrgType] = useState("");
  const [inlineNewOrgDescription, setInlineNewOrgDescription] = useState("");
  const [newContactType, setNewContactType] = useState("");
  const [newSector, setNewSector] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newGeography, setNewGeography] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDealTypes, setNewDealTypes] = useState("");
  const [newMinDealSize, setNewMinDealSize] = useState("");
  const [newMaxDealSize, setNewMaxDealSize] = useState("");
  const [documents, setDocuments] = useState<
    { id: string; filename: string; contentType: string | null }[]
  >([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichPreview, setEnrichPreview] = useState<{
    suggestions: Record<
      string,
      { current: unknown; suggested: unknown; source: string }
    >;
    reasoning: string;
    enabled: Record<string, boolean>;
  } | null>(null);
  const [newInternalOwner, setNewInternalOwner] = useState<string>(
    INTERNAL_CONTACT_OWNERS[0],
  );

  const resetCreateFields = useCallback(() => {
    setNewName("");
    setNewContactType("");
    setNewSector("");
    setNewOrganisationId("");
    setInlineNewOrgName("");
    setInlineNewOrgType("");
    setInlineNewOrgDescription("");
    setNewRole("");
    setNewGeography("");
    setNewPhone("");
    setNewEmail("");
    setNewWebsiteUrl("");
    setNewNotes("");
    setNewDealTypes("");
    setNewMinDealSize("");
    setNewMaxDealSize("");
    setNewInternalOwner(INTERNAL_CONTACT_OWNERS[0]);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      try {
        const res = await fetch(
          `/api/workspace/organisations?page=1&pageSize=${WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX}`,
        );
        const data = (await res.json()) as {
          rows?: WorkspaceOrganisationPageRow[];
        };
        if (!cancelled && res.ok) {
          setOrgOptions(data.rows ?? []);
        }
      } catch {
        if (!cancelled) setOrgOptions([]);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editingId) {
      setDocuments([]);
      setDocsLoading(false);
      return;
    }
    let cancelled = false;
    setDocsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/workspace/contacts/${editingId}/documents`,
        );
        const data = (await res.json()) as {
          rows?: {
            id: string;
            filename: string;
            content_type: string | null;
          }[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setDocuments([]);
          return;
        }
        setDocuments(
          (data.rows ?? []).map((r) => ({
            id: r.id,
            filename: r.filename,
            contentType: r.content_type,
          })),
        );
      } catch {
        if (!cancelled) setDocuments([]);
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, editingId]);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      resetCreateFields();
      setFormError(null);
      setDetailLoading(false);
      return;
    }
    if (!editingId) {
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setFormError(null);
    resetCreateFields();
    setNewName(editingContact?.name ?? "");

    (async () => {
      try {
        const res = await fetch(`/api/workspace/contacts/${editingId}`);
        const data = (await res.json()) as {
          error?: string;
          name?: string;
          contactType?: string | null;
          sector?: string | null;
          organisationId?: string | null;
          role?: string | null;
          geography?: string | null;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          websiteUrl?: string | null;
          internalOwner?: string | null;
          dealTypes?: string[] | null;
          minDealSize?: number | null;
          maxDealSize?: number | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            typeof data.error === "string" && data.error.length > 0
              ? data.error
              : "Could not load contact.";
          setFormError(msg);
          return;
        }
        setNewName(data.name ?? "");
        setNewContactType(data.contactType ?? "");
        setNewSector(data.sector ?? "");
        setNewOrganisationId(data.organisationId ?? "");
        setNewRole(data.role ?? "");
        setNewGeography(data.geography ?? "");
        setNewPhone(data.phone ?? "");
        setNewEmail(data.email ?? "");
        setNewWebsiteUrl(data.websiteUrl ?? "");
        setNewNotes(data.notes ?? "");
        setNewDealTypes(formatDealTypesForInput(data.dealTypes));
        setNewMinDealSize(
          data.minDealSize != null && Number.isFinite(data.minDealSize)
            ? String(data.minDealSize)
            : "",
        );
        setNewMaxDealSize(
          data.maxDealSize != null && Number.isFinite(data.maxDealSize)
            ? String(data.maxDealSize)
            : "",
        );
        setNewInternalOwner(
          isInternalContactOwner(data.internalOwner)
            ? data.internalOwner
            : INTERNAL_CONTACT_OWNERS[0],
        );
      } catch {
        if (!cancelled) setFormError("Network error while loading contact.");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mode, editingId, editingContact?.name, resetCreateFields]);

  const closeForm = () => {
    if (formBusy) return;
    setEnrichPreview(null);
    setEnrichError(null);
    onClose();
    setDetailLoading(false);
  };

  const onSubmitContact = async (e: FormEvent) => {
    e.preventDefault();
    if (detailLoading) return;
    if (mode === "edit" && editingId == null) return;
    setFormBusy(true);
    setFormError(null);
    let organisationId: string | null =
      newOrganisationId.trim() === "" ? null : newOrganisationId.trim();

    if (organisationId === CONTACT_FORM_NEW_ORG_VALUE) {
      const orgName = inlineNewOrgName.trim();
      if (orgName === "") {
        setFormError("Enter a name for the new organisation.");
        setFormBusy(false);
        return;
      }
      try {
        const orgRes = await fetch("/api/workspace/organisations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: orgName,
            type: inlineNewOrgType.trim() === "" ? null : inlineNewOrgType.trim(),
            description:
              inlineNewOrgDescription.trim() === ""
                ? null
                : inlineNewOrgDescription.trim(),
          }),
        });
        const orgData = (await orgRes.json()) as {
          id?: string;
          error?: string;
          hint?: string;
        };
        if (!orgRes.ok) {
          const parts = [orgData.error, orgData.hint].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
          setFormError(
            parts.length > 0 ? parts.join(" ") : "Could not create organisation.",
          );
          setFormBusy(false);
          return;
        }
        const id = orgData.id;
        if (typeof id !== "string" || id.length === 0) {
          setFormError("Organisation was created but no id was returned.");
          setFormBusy(false);
          return;
        }
        organisationId = id;
        setOrgOptions((prev) => {
          if (prev.some((o) => o.id === id)) return prev;
          return [
            {
              id,
              name: orgName,
              type:
                inlineNewOrgType.trim() === "" ? null : inlineNewOrgType.trim(),
              description:
                inlineNewOrgDescription.trim() === ""
                  ? null
                  : inlineNewOrgDescription.trim(),
            },
            ...prev,
          ];
        });
      } catch {
        setFormError("Network error while creating organisation.");
        setFormBusy(false);
        return;
      }
    }

    const minDealRaw = newMinDealSize.trim();
    const maxDealRaw = newMaxDealSize.trim();
    let minDealSize: number | null = null;
    let maxDealSize: number | null = null;
    if (minDealRaw !== "") {
      const n = Number.parseFloat(minDealRaw);
      if (!Number.isFinite(n)) {
        setFormError("Min deal size must be a valid number.");
        setFormBusy(false);
        return;
      }
      minDealSize = n;
    }
    if (maxDealRaw !== "") {
      const n = Number.parseFloat(maxDealRaw);
      if (!Number.isFinite(n)) {
        setFormError("Max deal size must be a valid number.");
        setFormBusy(false);
        return;
      }
      maxDealSize = n;
    }

    const payload = {
      name: newName,
      contactType: newContactType,
      sector: newSector,
      organisationId,
      role: newRole.trim() === "" ? null : newRole.trim(),
      geography: newGeography.trim() === "" ? null : newGeography.trim(),
      phone: newPhone.trim() === "" ? null : newPhone.trim(),
      email: newEmail.trim() === "" ? null : newEmail.trim(),
      websiteUrl: newWebsiteUrl.trim() === "" ? null : newWebsiteUrl.trim(),
      notes: newNotes.trim() === "" ? null : newNotes.trim(),
      dealTypes: parseDealTypesFromInput(newDealTypes),
      minDealSize,
      maxDealSize,
      internalOwner: newInternalOwner,
    };

    try {
      const res = await fetch(
        mode === "edit"
          ? `/api/workspace/contacts/${editingId}`
          : "/api/workspace/contacts",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setFormError(parts.length > 0 ? parts.join(" ") : "Could not save.");
        return;
      }
      if (mode === "create") {
        onAfterCreate?.();
      }
      onSaved();
      onClose();
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setFormBusy(false);
    }
  };

  const pdfDocuments = documents.filter((d) =>
    isPdfAttachment(d.filename, d.contentType),
  );
  const canEnrichFromSources =
    mode === "edit" &&
    editingId != null &&
    !detailLoading &&
    (newWebsiteUrl.trim().length > 0 || pdfDocuments.length > 0);

  const runEnrichFromSources = async () => {
    if (!editingId || !canEnrichFromSources) return;
    setEnrichBusy(true);
    setEnrichError(null);
    try {
      const body: { websiteUrl?: string; attachmentIds?: string[] } = {};
      if (newWebsiteUrl.trim()) body.websiteUrl = newWebsiteUrl.trim();
      if (pdfDocuments.length > 0) {
        body.attachmentIds = pdfDocuments.map((d) => d.id);
      }
      const res = await fetch(`/api/workspace/contacts/${editingId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        raw?: string;
        suggestions?: Record<
          string,
          { current: unknown; suggested: unknown; source: string }
        >;
        reasoning?: string;
      };
      if (!res.ok) {
        setEnrichError(data.error ?? "Enrich failed.");
        return;
      }
      const suggestions = data.suggestions ?? {};
      const enabled: Record<string, boolean> = {};
      for (const k of Object.keys(suggestions)) enabled[k] = true;
      setEnrichPreview({
        suggestions,
        reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
        enabled,
      });
    } catch {
      setEnrichError("Network error while enriching.");
    } finally {
      setEnrichBusy(false);
    }
  };

  const applyEnrichSelected = async () => {
    if (!editingId || !enrichPreview) return;
    let organisationId: string | null =
      newOrganisationId.trim() === "" ? null : newOrganisationId.trim();
    if (organisationId === CONTACT_FORM_NEW_ORG_VALUE) {
      setEnrichError("Finish saving a new organisation before applying enrich.");
      return;
    }
    setFormBusy(true);
    setEnrichError(null);
    try {
      const { suggestions, enabled } = enrichPreview;
      let sector = newSector;
      let role = newRole;
      let geography = newGeography;
      let notes = newNotes;
      let dealTypesInput = newDealTypes;
      let minDealStr = newMinDealSize;
      let maxDealStr = newMaxDealSize;

      if (enabled.sector && suggestions.sector) {
        sector = String(suggestions.sector.suggested);
      }
      if (enabled.role && suggestions.role) {
        role = String(suggestions.role.suggested);
      }
      if (enabled.geography && suggestions.geography) {
        geography = String(suggestions.geography.suggested);
      }
      if (enabled.notes && suggestions.notes) {
        notes = String(suggestions.notes.suggested);
      }
      if (enabled.deal_types && suggestions.deal_types) {
        const s = suggestions.deal_types.suggested;
        dealTypesInput = Array.isArray(s) ? s.join(", ") : String(s);
      }
      if (enabled.min_deal_size && suggestions.min_deal_size) {
        const n = Number(suggestions.min_deal_size.suggested);
        minDealStr = Number.isFinite(n) ? String(n) : "";
      }
      if (enabled.max_deal_size && suggestions.max_deal_size) {
        const n = Number(suggestions.max_deal_size.suggested);
        maxDealStr = Number.isFinite(n) ? String(n) : "";
      }

      const minRaw = minDealStr.trim();
      const maxRaw = maxDealStr.trim();
      let minDealSize: number | null = null;
      let maxDealSize: number | null = null;
      if (minRaw !== "") {
        const n = Number.parseFloat(minRaw);
        if (!Number.isFinite(n)) {
          setEnrichError("Min deal size must be a valid number.");
          setFormBusy(false);
          return;
        }
        minDealSize = n;
      }
      if (maxRaw !== "") {
        const n = Number.parseFloat(maxRaw);
        if (!Number.isFinite(n)) {
          setEnrichError("Max deal size must be a valid number.");
          setFormBusy(false);
          return;
        }
        maxDealSize = n;
      }

      const payload = {
        name: newName,
        contactType: newContactType,
        sector,
        organisationId,
        role: role.trim() === "" ? null : role.trim(),
        geography: geography.trim() === "" ? null : geography.trim(),
        phone: newPhone.trim() === "" ? null : newPhone.trim(),
        email: newEmail.trim() === "" ? null : newEmail.trim(),
        websiteUrl: newWebsiteUrl.trim() === "" ? null : newWebsiteUrl.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
        dealTypes: parseDealTypesFromInput(dealTypesInput),
        minDealSize,
        maxDealSize,
        internalOwner: newInternalOwner,
      };

      const res = await fetch(`/api/workspace/contacts/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        const parts = [d.error, d.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setEnrichError(parts.length > 0 ? parts.join(" ") : "Could not apply.");
        setFormBusy(false);
        return;
      }

      setEnrichPreview(null);

      const refresh = await fetch(`/api/workspace/contacts/${editingId}`);
      const rd = (await refresh.json()) as {
        error?: string;
        sector?: string | null;
        role?: string | null;
        geography?: string | null;
        notes?: string | null;
        dealTypes?: string[] | null;
        minDealSize?: number | null;
        maxDealSize?: number | null;
      };
      if (refresh.ok && !rd.error) {
        setNewSector(rd.sector ?? "");
        setNewRole(rd.role ?? "");
        setNewGeography(rd.geography ?? "");
        setNewNotes(rd.notes ?? "");
        setNewDealTypes(formatDealTypesForInput(rd.dealTypes));
        setNewMinDealSize(
          rd.minDealSize != null && Number.isFinite(rd.minDealSize)
            ? String(rd.minDealSize)
            : "",
        );
        setNewMaxDealSize(
          rd.maxDealSize != null && Number.isFinite(rd.maxDealSize)
            ? String(rd.maxDealSize)
            : "",
        );
      }
    } catch {
      setEnrichError("Network error while applying.");
    } finally {
      setFormBusy(false);
    }
  };

  const formIdPrefix = mode === "edit" ? `edit-${editingId}` : "create";

  const formNode = (
    <form
      onSubmit={onSubmitContact}
      className="space-y-3 p-4"
      key={formIdPrefix}
    >
      {detailLoading ? (
        <p className="py-6 text-center text-sm text-charcoal-light">
          Loading contact…
        </p>
      ) : (
        <>
          <div>
            <label
              htmlFor={`cu-name-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Name
            </label>
            <input
              id={`cu-name-${formIdPrefix}`}
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Full name"
              autoComplete="name"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-type-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Select Type
            </label>
            <select
              id={`cu-type-${formIdPrefix}`}
              required
              value={newContactType}
              onChange={(e) => setNewContactType(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
            >
              <option value="">Select a type…</option>
              {CONTACT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`cu-sector-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Sector
            </label>
            <input
              id={`cu-sector-${formIdPrefix}`}
              required
              value={newSector}
              onChange={(e) => setNewSector(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="e.g. Fintech"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-owner-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Rex team (internal)
            </label>
            <select
              id={`cu-owner-${formIdPrefix}`}
              required
              value={newInternalOwner}
              onChange={(e) => setNewInternalOwner(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
            >
              {INTERNAL_CONTACT_OWNERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-charcoal-light/80">
              Who added this contact to Rex — not shown to founders or LPs.
            </p>
          </div>
          <div>
            <label
              htmlFor={`cu-org-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Organisation
            </label>
            <select
              id={`cu-org-${formIdPrefix}`}
              value={newOrganisationId}
              onChange={(e) => {
                const v = e.target.value;
                setNewOrganisationId(v);
                if (v !== CONTACT_FORM_NEW_ORG_VALUE) {
                  setInlineNewOrgName("");
                  setInlineNewOrgType("");
                  setInlineNewOrgDescription("");
                }
              }}
              className={WORKSPACE_FORM_INPUT_CLASS}
            >
              <option value="">
                {orgsLoading ? "Loading organisations…" : "No organisation"}
              </option>
              <option value={CONTACT_FORM_NEW_ORG_VALUE}>
                Create new organisation…
              </option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {newOrganisationId === CONTACT_FORM_NEW_ORG_VALUE ? (
              <div className="mt-3 space-y-3 rounded-lg border border-charcoal/10 bg-cream-light/50 p-3">
                <p className="text-xs text-charcoal-light/90">
                  This organisation is saved to your workspace and linked to
                  this contact.
                </p>
                <div>
                  <label
                    htmlFor={`cu-new-org-name-${formIdPrefix}`}
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    New organisation name
                  </label>
                  <input
                    id={`cu-new-org-name-${formIdPrefix}`}
                    required
                    value={inlineNewOrgName}
                    onChange={(e) => setInlineNewOrgName(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                    placeholder="Company or fund name"
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`cu-new-org-type-${formIdPrefix}`}
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Type{" "}
                    <span className="font-normal text-charcoal-light/70">
                      (optional)
                    </span>
                  </label>
                  <input
                    id={`cu-new-org-type-${formIdPrefix}`}
                    value={inlineNewOrgType}
                    onChange={(e) => setInlineNewOrgType(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                    placeholder="e.g. LP, GP, advisor"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`cu-new-org-desc-${formIdPrefix}`}
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Description{" "}
                    <span className="font-normal text-charcoal-light/70">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id={`cu-new-org-desc-${formIdPrefix}`}
                    value={inlineNewOrgDescription}
                    onChange={(e) =>
                      setInlineNewOrgDescription(e.target.value)
                    }
                    rows={2}
                    className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                    placeholder="Optional context"
                  />
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <label
              htmlFor={`cu-role-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Role
            </label>
            <input
              id={`cu-role-${formIdPrefix}`}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Title or function"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-geo-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Geography
            </label>
            <input
              id={`cu-geo-${formIdPrefix}`}
              value={newGeography}
              onChange={(e) => setNewGeography(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Region or city"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-phone-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Phone{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id={`cu-phone-${formIdPrefix}`}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="+44…"
              autoComplete="tel"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-email-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Email{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id={`cu-email-${formIdPrefix}`}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label
              htmlFor={`cu-website-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Website{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id={`cu-website-${formIdPrefix}`}
              value={newWebsiteUrl}
              onChange={(e) => setNewWebsiteUrl(e.target.value)}
              className={`${WORKSPACE_FORM_INPUT_CLASS} font-mono text-[13px]`}
              placeholder="https://example.com/profile"
              autoComplete="url"
              inputMode="url"
            />
            <p className="mt-1 text-[11px] text-charcoal-light/80">
              LinkedIn, company team page, or personal site — stored on the
              contact record.
            </p>
          </div>
          <div>
            <label
              htmlFor={`cu-deal-types-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Deal types{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id={`cu-deal-types-${formIdPrefix}`}
              value={newDealTypes}
              onChange={(e) => setNewDealTypes(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Comma-separated — e.g. Venture debt, Growth equity"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`cu-min-deal-${formIdPrefix}`}
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                Min deal size{" "}
                <span className="font-normal text-charcoal-light/70">
                  (optional)
                </span>
              </label>
              <input
                id={`cu-min-deal-${formIdPrefix}`}
                inputMode="decimal"
                value={newMinDealSize}
                onChange={(e) => setNewMinDealSize(e.target.value)}
                className={WORKSPACE_FORM_INPUT_CLASS}
                placeholder="e.g. 1000000"
              />
            </div>
            <div>
              <label
                htmlFor={`cu-max-deal-${formIdPrefix}`}
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                Max deal size{" "}
                <span className="font-normal text-charcoal-light/70">
                  (optional)
                </span>
              </label>
              <input
                id={`cu-max-deal-${formIdPrefix}`}
                inputMode="decimal"
                value={newMaxDealSize}
                onChange={(e) => setNewMaxDealSize(e.target.value)}
                className={WORKSPACE_FORM_INPUT_CLASS}
                placeholder="e.g. 10000000"
              />
            </div>
          </div>
          {mode === "edit" ? (
            <div className="rounded-lg border border-charcoal/10 bg-cream-light/40 p-3">
              <p className={`${WORKSPACE_FORM_LABEL_CLASS} mb-1`}>
                Supporting PDFs
              </p>
              {docsLoading ? (
                <p className="text-xs text-charcoal-light/80">Loading…</p>
              ) : pdfDocuments.length === 0 ? (
                <p className="text-xs text-charcoal-light/80">
                  No PDFs on this contact. Add PDFs from the contact profile, or
                  enter a website URL above.
                </p>
              ) : (
                <ul className="mt-1 list-inside list-disc text-xs text-charcoal">
                  {pdfDocuments.map((d) => (
                    <li key={d.id}>{d.filename}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={runEnrichFromSources}
                disabled={
                  !canEnrichFromSources ||
                  enrichBusy ||
                  formBusy ||
                  detailLoading
                }
                className={`mt-3 ${WORKSPACE_FORM_BTN_SECONDARY}`}
              >
                {enrichBusy ? "Enriching…" : "Enrich from sources"}
              </button>
              {enrichError ? (
                <p className="mt-2 text-xs text-red-700/90" role="alert">
                  {enrichError}
                </p>
              ) : null}
            </div>
          ) : null}
          {enrichPreview && mode === "edit" ? (
            <div className="space-y-3 rounded-lg border border-charcoal/15 bg-cream-light/30 p-3">
              <p className="text-sm font-medium text-charcoal">
                Suggested updates
              </p>
              <p className="text-xs text-charcoal-light/90">
                {enrichPreview.reasoning}
              </p>
              {Object.keys(enrichPreview.suggestions).length === 0 ? (
                <p className="text-xs text-charcoal-light">
                  No field updates suggested.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto rounded border border-charcoal/10">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-charcoal/10 bg-cream-light/50">
                        <th className="w-12 p-2 font-semibold">Use</th>
                        <th className="p-2 font-semibold">Field</th>
                        <th className="p-2 font-semibold">Current</th>
                        <th className="p-2 font-semibold">Suggested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(enrichPreview.suggestions).map(
                        ([key, row]) => (
                          <tr
                            key={key}
                            className="border-b border-charcoal/5 align-top"
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={enrichPreview.enabled[key] ?? false}
                                onChange={(e) =>
                                  setEnrichPreview((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          enabled: {
                                            ...prev.enabled,
                                            [key]: e.target.checked,
                                          },
                                        }
                                      : null,
                                  )
                                }
                              />
                            </td>
                            <td className="p-2 text-charcoal">
                              {formatFieldLabel(key)}
                            </td>
                            <td className="max-w-[140px] break-words p-2 text-charcoal-light">
                              {formatSuggestionValue(row.current)}
                            </td>
                            <td className="max-w-[140px] break-words p-2 text-charcoal">
                              {formatSuggestionValue(row.suggested)}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEnrichPreview(null)}
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                  disabled={formBusy}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={applyEnrichSelected}
                  disabled={
                    formBusy ||
                    Object.keys(enrichPreview.suggestions).length === 0 ||
                    !Object.keys(enrichPreview.suggestions).some(
                      (k) => enrichPreview.enabled[k],
                    )
                  }
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                >
                  {formBusy ? "Applying…" : "Apply selected"}
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <label
              htmlFor={`cu-notes-${formIdPrefix}`}
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Notes
            </label>
            <textarea
              id={`cu-notes-${formIdPrefix}`}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={3}
              className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              placeholder="Optional"
            />
          </div>
        </>
      )}
      {formError ? (
        <p className="text-sm text-red-700/90" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={closeForm}
          disabled={formBusy}
          className={WORKSPACE_FORM_BTN_SECONDARY}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={formBusy || detailLoading}
          className={WORKSPACE_FORM_BTN_PRIMARY}
        >
          {formBusy
            ? "Saving…"
            : mode === "create"
              ? "Add contact"
              : "Save changes"}
        </button>
      </div>
    </form>
  );

  const isEdit = mode === "edit";

  return (
    <WorkspaceCreateDialog
      open={open}
      title={isEdit ? "Edit contact details" : "New contact"}
      onClose={closeForm}
      variant={isEdit ? "modal" : "fullscreen"}
      modalMaxWidthClass={isEdit ? "sm:max-w-2xl" : "sm:max-w-md"}
    >
      {formNode}
    </WorkspaceCreateDialog>
  );
}
