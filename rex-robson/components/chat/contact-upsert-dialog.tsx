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
  const [newNotes, setNewNotes] = useState("");
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
    setNewNotes("");
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
          internalOwner?: string | null;
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
        setNewNotes(data.notes ?? "");
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

    const payload = {
      name: newName,
      contactType: newContactType,
      sector: newSector,
      organisationId,
      role: newRole.trim() === "" ? null : newRole.trim(),
      geography: newGeography.trim() === "" ? null : newGeography.trim(),
      phone: newPhone.trim() === "" ? null : newPhone.trim(),
      email: newEmail.trim() === "" ? null : newEmail.trim(),
      notes: newNotes.trim() === "" ? null : newNotes.trim(),
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
      modalMaxWidthClass={isEdit ? "max-w-2xl" : "max-w-md"}
    >
      {formNode}
    </WorkspaceCreateDialog>
  );
}
