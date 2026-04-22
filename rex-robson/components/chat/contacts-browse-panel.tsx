"use client";

import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT,
  type WorkspaceContactPageRow,
} from "@/lib/data/workspace-contacts.types";
import {
  WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX,
  type WorkspaceOrganisationPageRow,
} from "@/lib/data/workspace-organisations-page.types";
import { ContactDetailView } from "./contact-detail-view";
import { WorkspaceBrowsePagination } from "./workspace-browse-pagination";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WORKSPACE_BROWSE_ROW_BUTTON_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

function muted(line: string | null | undefined) {
  if (line == null || line === "") return null;
  return (
    <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/85">
      {line}
    </p>
  );
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const RECENCY_FULL_WEEKS = 24 * 0.2;
const RECENCY_ZERO_WEEKS = 24;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recencyStrength(lastContactDate: string | null) {
  if (!lastContactDate) return 0;
  const ts = Date.parse(lastContactDate);
  if (!Number.isFinite(ts)) return 0;
  const elapsedWeeks = Math.max(0, (Date.now() - ts) / MS_PER_WEEK);
  if (elapsedWeeks <= RECENCY_FULL_WEEKS) return 1;
  if (elapsedWeeks >= RECENCY_ZERO_WEEKS) return 0;
  return (
    1 -
    (elapsedWeeks - RECENCY_FULL_WEEKS) /
      (RECENCY_ZERO_WEEKS - RECENCY_FULL_WEEKS)
  );
}

function recencyLabel(lastContactDate: string | null) {
  if (!lastContactDate) return "No contact";
  const ts = Date.parse(lastContactDate);
  if (!Number.isFinite(ts)) return "No contact";
  const elapsedMs = Math.max(0, Date.now() - ts);
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays < 1) return "Today";
  if (elapsedDays < 7) return `${Math.floor(elapsedDays)}d ago`;
  if (elapsedDays < 30) return `${Math.floor(elapsedDays / 7)}w ago`;
  return `${Math.floor(elapsedDays / 30)}mo ago`;
}

type ApiOk = { rows: WorkspaceContactPageRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

/** Select value: create org via inline fields, then link contact. */
const CONTACT_FORM_NEW_ORG_VALUE = "__new__";

const CONTACT_TYPE_OPTIONS = ["Founder", "Investor", "Lender", "Other"] as const;

type ContactsBrowsePanelProps = {
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
};

export function ContactsBrowsePanel({
  autoOpenCreate = false,
  onAutoOpenCreateHandled,
}: ContactsBrowsePanelProps = {}) {
  const pageSize = WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WorkspaceContactPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [orgOptions, setOrgOptions] = useState<WorkspaceOrganisationPageRow[]>([]);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeOrganisationType, setActiveOrganisationType] = useState("");
  const [organisationTypeOptions, setOrganisationTypeOptions] = useState<string[]>(
    [],
  );
  const [detailContact, setDetailContact] =
    useState<WorkspaceContactPageRow | null>(null);
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeOrganisationType]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedQuery !== "") {
      params.set("q", debouncedQuery);
    }
    if (activeOrganisationType !== "") {
      params.set("organisationType", activeOrganisationType);
    }
    try {
      const res = await fetch(`/api/workspace/contacts?${params.toString()}`);
      const data = (await res.json()) as ApiOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load contacts.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading contacts.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, pageSize, activeOrganisationType]);

  useEffect(() => {
    void load();
  }, [load, reloadTick]);

  useEffect(() => {
    if (!detailContact) return;
    const fresh = rows.find((r) => r.id === detailContact.id);
    if (fresh && fresh !== detailContact) {
      setDetailContact(fresh);
    }
  }, [rows, detailContact]);

  useEffect(() => {
    if (!formOpen) return;
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
  }, [formOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workspace/organisations?page=1&pageSize=${WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX}`,
        );
        const data = (await res.json()) as { rows?: WorkspaceOrganisationPageRow[] };
        if (!res.ok || cancelled) return;
        const values = Array.from(
          new Set(
            (data.rows ?? [])
              .map((x) => x.type?.trim() ?? "")
              .filter((x) => x.length > 0),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setOrganisationTypeOptions(values);
      } catch {
        if (!cancelled) setOrganisationTypeOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  useEffect(() => {
    if (page !== safePage && safePage >= 1) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditingId(null);
    setDetailLoading(false);
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
    setFormError(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    if (autoOpenCreate) {
      openCreate();
      onAutoOpenCreateHandled?.();
    }
  }, [autoOpenCreate, openCreate, onAutoOpenCreateHandled]);

  const openEdit = async (c: WorkspaceContactPageRow) => {
    setFormMode("edit");
    setEditingId(c.id);
    setFormError(null);
    setFormOpen(true);
    setDetailLoading(true);
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
    try {
      const res = await fetch(`/api/workspace/contacts/${c.id}`);
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
      };
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
    } catch {
      setFormError("Network error while loading contact.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
    setEditingId(null);
    setDetailLoading(false);
  };

  const onSubmitContact = async (e: FormEvent) => {
    e.preventDefault();
    if (detailLoading) return;
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
    };
    try {
      const isEdit = formMode === "edit" && editingId != null;
      const res = await fetch(
        isEdit ? `/api/workspace/contacts/${editingId}` : "/api/workspace/contacts",
        {
          method: isEdit ? "PATCH" : "POST",
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
      setFormOpen(false);
      setEditingId(null);
      if (formMode === "create") setPage(1);
      setReloadTick((n) => n + 1);
      setDetailRefreshTick((n) => n + 1);
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setFormBusy(false);
    }
  };

  const contactFormNode = (
    <form
      onSubmit={onSubmitContact}
      className="space-y-3 p-4"
      key={`${formMode}-${editingId ?? "new"}`}
    >
      {detailLoading ? (
        <p className="py-6 text-center text-sm text-charcoal-light">
          Loading contact…
        </p>
      ) : (
        <>
          <div>
            <label
              htmlFor="contact-form-name"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Name
            </label>
            <input
              id="contact-form-name"
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
              htmlFor="contact-form-type"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Select Type
            </label>
            <select
              id="contact-form-type"
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
              htmlFor="contact-form-sector"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Sector
            </label>
            <input
              id="contact-form-sector"
              required
              value={newSector}
              onChange={(e) => setNewSector(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="e.g. Fintech"
            />
          </div>
          <div>
            <label
              htmlFor="contact-form-org"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Organisation
            </label>
            <select
              id="contact-form-org"
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
                    htmlFor="contact-form-new-org-name"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    New organisation name
                  </label>
                  <input
                    id="contact-form-new-org-name"
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
                    htmlFor="contact-form-new-org-type"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Type{" "}
                    <span className="font-normal text-charcoal-light/70">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="contact-form-new-org-type"
                    value={inlineNewOrgType}
                    onChange={(e) => setInlineNewOrgType(e.target.value)}
                    className={WORKSPACE_FORM_INPUT_CLASS}
                    placeholder="e.g. LP, GP, advisor"
                  />
                </div>
                <div>
                  <label
                    htmlFor="contact-form-new-org-desc"
                    className={WORKSPACE_FORM_LABEL_CLASS}
                  >
                    Description{" "}
                    <span className="font-normal text-charcoal-light/70">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="contact-form-new-org-desc"
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
              htmlFor="contact-form-role"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Role
            </label>
            <input
              id="contact-form-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Title or function"
            />
          </div>
          <div>
            <label
              htmlFor="contact-form-geo"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Geography
            </label>
            <input
              id="contact-form-geo"
              value={newGeography}
              onChange={(e) => setNewGeography(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="Region or city"
            />
          </div>
          <div>
            <label
              htmlFor="contact-form-phone"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Phone{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id="contact-form-phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="+44…"
              autoComplete="tel"
            />
          </div>
          <div>
            <label
              htmlFor="contact-form-email"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Email{" "}
              <span className="font-normal text-charcoal-light/70">
                (optional)
              </span>
            </label>
            <input
              id="contact-form-email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={WORKSPACE_FORM_INPUT_CLASS}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label
              htmlFor="contact-form-notes"
              className={WORKSPACE_FORM_LABEL_CLASS}
            >
              Notes
            </label>
            <textarea
              id="contact-form-notes"
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
            : formMode === "create"
              ? "Add contact"
              : "Save changes"}
        </button>
      </div>
    </form>
  );

  const dialogNode = (
    <WorkspaceCreateDialog
      open={formOpen}
      title={formMode === "create" ? "New contact" : "Edit contact"}
      onClose={closeForm}
    >
      {contactFormNode}
    </WorkspaceCreateDialog>
  );

  if (detailContact) {
    return (
      <>
        <ContactDetailView
          contact={detailContact}
          refreshTick={detailRefreshTick}
          onBack={() => setDetailContact(null)}
          onEdit={() => void openEdit(detailContact)}
          onAdd={openCreate}
          onDeleted={() => {
            setDetailContact(null);
            setReloadTick((n) => n + 1);
          }}
        />
        {dialogNode}
      </>
    );
  }

  return (
    <div className="flex flex-col px-4 py-6 sm:px-8">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl tracking-tight text-charcoal">
              Contacts
            </h2>
            <p className="mt-1 text-xs text-charcoal-light/80">
              {loading
                ? "Loading…"
                : total === 0
                  ? debouncedQuery
                    ? "No matches for that search."
                    : "No contacts yet."
                  : `Showing ${from}–${to} of ${total}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-charcoal/90"
          >
            <Plus className="size-3.5" aria-hidden />
            Add contact
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search contacts</span>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search by name, company, role, notes…"
            autoComplete="off"
            className="w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-light/50 outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="rounded-lg border border-charcoal/15 bg-cream px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-cream-light"
          >
            {filtersOpen ? "Hide filters" : "Filter by type"}
          </button>
          {activeOrganisationType ? (
            <button
              type="button"
              onClick={() => setActiveOrganisationType("")}
              className="rounded-lg border border-charcoal/15 bg-cream-light px-3 py-1.5 text-xs text-charcoal-light"
            >
              Clear: {activeOrganisationType}
            </button>
          ) : null}
        </div>
        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveOrganisationType("")}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeOrganisationType === ""
                  ? "border-charcoal bg-charcoal text-cream"
                  : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
              }`}
            >
              All
            </button>
            {organisationTypeOptions.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveOrganisationType(type)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  activeOrganisationType === type
                    ? "border-charcoal bg-charcoal text-cream"
                    : "border-charcoal/15 bg-cream text-charcoal-light hover:bg-cream-light"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 shrink-0 text-sm text-red-700/90" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream-light/40 p-2">
        <ul className="divide-y divide-charcoal/[0.06]">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <li key={i} className="animate-pulse px-4 py-3">
                  <div className="h-4 w-40 rounded bg-charcoal/10" />
                  <div className="mt-2 h-3 w-64 rounded bg-charcoal/5" />
                </li>
              ))
            : rows.map((c) => {
                const sub = [c.geography, c.contact_type, c.sector]
                  .filter(Boolean)
                  .join(" · ");
                const strength = recencyStrength(c.last_contact_date);
                const activeDots = strength <= 0 ? 0 : Math.ceil(strength * 5);
                const strengthPct = Math.round(strength * 100);
                return (
                  <li key={c.id} className="py-1.5">
                    <button
                      type="button"
                      onClick={() => setDetailContact(c)}
                      className={`${WORKSPACE_BROWSE_ROW_BUTTON_CLASS} rounded-xl border border-charcoal/[0.07] bg-cream px-3 py-3 shadow-[0_1px_0_rgba(10,10,10,0.02)] transition hover:border-charcoal/[0.12] hover:bg-cream-light/40`}
                      aria-label={`View ${c.name}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-charcoal">{c.name}</p>
                          {muted(sub || null)}
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <div
                            className="flex items-center gap-1"
                            aria-label={`Recency strength ${strengthPct}%`}
                          >
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={`block size-1.5 rounded-full ${
                                  i < activeDots
                                    ? "bg-charcoal"
                                    : "bg-charcoal/20"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-charcoal-light/75">
                            {recencyLabel(c.last_contact_date)}
                          </span>
                          {c.organisation_type ? (
                            <span className="rounded-full border border-charcoal/10 bg-cream-light px-2 py-0.5 text-xs text-charcoal-light">
                              {c.organisation_type}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
        </ul>
      </div>

      <WorkspaceBrowsePagination
        ariaLabel="Contacts pagination"
        safePage={safePage}
        totalPages={totalPages}
        loading={loading}
        onPageChange={setPage}
      />

      {dialogNode}
    </div>
  );
}
