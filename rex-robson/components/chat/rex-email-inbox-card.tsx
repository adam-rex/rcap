"use client";

import { useCallback, useMemo, useState } from "react";
import type { WorkspaceEmailExtractionListItem } from "@/lib/data/workspace-emails.types";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
} from "./workspace-create-dialog";

type RexEmailInboxCardProps = {
  emailId: string;
  receivedAt: string;
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  threadParticipantCount: number | null;
  extractions: WorkspaceEmailExtractionListItem[];
  onRefresh: () => void;
};

function kindLabel(kind: WorkspaceEmailExtractionListItem["kind"]): string {
  switch (kind) {
    case "contact":
      return "Contact";
    case "organisation":
      return "Organisation";
    case "intro_request":
      return "Intro request";
    default:
      return "Item";
  }
}

function kindBadgeClass(kind: WorkspaceEmailExtractionListItem["kind"]): string {
  switch (kind) {
    case "contact":
      return "bg-sky-100 text-sky-950";
    case "organisation":
      return "bg-violet-100 text-violet-950";
    case "intro_request":
      return "bg-amber-100 text-amber-950";
    default:
      return "bg-charcoal/10 text-charcoal";
  }
}

function forwardedToLine(toAddresses: string[]): string {
  if (toAddresses.length === 0) return "Rex";
  const rexish = toAddresses.find((a) => /rex/i.test(a));
  return rexish ?? toAddresses[0] ?? "Rex";
}

export function RexEmailInboxCard({
  emailId,
  receivedAt,
  fromName,
  fromAddress,
  toAddresses,
  subject,
  threadParticipantCount,
  extractions,
  onRefresh,
}: RexEmailInboxCardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAllBusy, setConfirmAllBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pending = useMemo(
    () => extractions.filter((x) => x.status === "pending"),
    [extractions],
  );

  const fromDisplay = fromName
    ? `${fromName} <${fromAddress}>`
    : fromAddress;

  const threadLine =
    threadParticipantCount != null && threadParticipantCount > 0
      ? `${threadParticipantCount} people in thread`
      : null;

  const patchExtraction = useCallback(
    async (
      extractionId: string,
      body: Record<string, unknown>,
    ): Promise<boolean> => {
      setBusyId(extractionId);
      setFormError(null);
      try {
        const res = await fetch(
          `/api/workspace/emails/${emailId}/extractions/${extractionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setFormError(data.error ?? "Something went wrong.");
          return false;
        }
        setEditId(null);
        onRefresh();
        return true;
      } catch {
        setFormError("Network error.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [emailId, onRefresh],
  );

  const onConfirmAll = async () => {
    setConfirmAllBusy(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/workspace/emails/${emailId}/extractions/confirm-all`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        error?: string;
        errors?: string[];
        hadErrors?: boolean;
      };
      if (!res.ok) {
        setFormError(data.error ?? "Confirm all failed.");
        return;
      }
      if (data.hadErrors && Array.isArray(data.errors) && data.errors.length > 0) {
        setFormError(data.errors.join(" "));
      }
      onRefresh();
    } catch {
      setFormError("Network error.");
    } finally {
      setConfirmAllBusy(false);
    }
  };

  if (extractions.length === 0) {
    return null;
  }

  return (
    <section
      className="mb-8 rounded-xl border border-charcoal/10 bg-white p-4 shadow-sm sm:p-5"
      aria-label="Rex inbox"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-charcoal/[0.06] pb-4">
        <h3 className="font-serif text-lg tracking-tight text-charcoal">
          Rex inbox
        </h3>
        {pending.length > 0 ? (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-950">
            {pending.length} item{pending.length === 1 ? "" : "s"} to review
          </span>
        ) : (
          <span className="rounded-full bg-charcoal/[0.06] px-3 py-1 text-xs font-medium text-charcoal-light">
            Reviewed
          </span>
        )}
      </div>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-charcoal-light/80">
        Forwarded email
      </p>
      <p className="mt-1 font-medium text-charcoal">{subject || "(No subject)"}</p>
      <p className="mt-1 text-xs text-charcoal-light">
        From: {fromDisplay}
        <span className="text-charcoal-light/50"> · </span>
        Forwarded to {forwardedToLine(toAddresses)}
        {threadLine ? (
          <>
            <span className="text-charcoal-light/50"> · </span>
            {threadLine}
          </>
        ) : null}
      </p>

      <p className="mt-6 text-[10px] font-semibold uppercase tracking-wider text-charcoal-light/80">
        Rex extracted
      </p>

      {formError ? (
        <p className="mt-3 text-sm text-red-700/90" role="alert">
          {formError}
        </p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-3">
        {extractions.map((x) => (
          <li key={x.id}>
            <ExtractionCard
              extraction={x}
              receivedAt={receivedAt}
              busy={busyId === x.id}
              editing={editId === x.id}
              onToggleEdit={() =>
                setEditId((id) => (id === x.id ? null : x.id))
              }
              onPatch={patchExtraction}
            />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 border-t border-charcoal/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm italic text-charcoal-light">
          Pls confirm or I&apos;ll just sit here — Rex
        </p>
        <button
          type="button"
          disabled={confirmAllBusy || pending.length === 0}
          onClick={() => void onConfirmAll()}
          className={WORKSPACE_FORM_BTN_PRIMARY}
        >
          {confirmAllBusy ? "Working…" : "Confirm all"}
        </button>
      </div>
    </section>
  );
}

function ExtractionCard({
  extraction: x,
  receivedAt,
  busy,
  editing,
  onToggleEdit,
  onPatch,
}: {
  extraction: WorkspaceEmailExtractionListItem;
  receivedAt: string;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (
    extractionId: string,
    body: Record<string, unknown>,
  ) => Promise<boolean>;
}) {
  const p = x.payload;
  const matchedId =
    typeof p.matchedContactId === "string" ? p.matchedContactId.trim() : "";

  const [draft, setDraft] = useState(() => ({
    name: String(p.name ?? x.title ?? ""),
    organisationName: String(p.organisationName ?? ""),
    role: String(p.role ?? ""),
    geography: String(p.geography ?? ""),
    notes: String(p.notes ?? ""),
    orgName: String(p.name ?? x.title ?? ""),
    orgType: String(p.type ?? ""),
    orgDescription: String(p.description ?? ""),
    introTitle: String(p.title ?? x.title ?? "Introduction request"),
    introBody: String(p.body ?? p.detail ?? p.context ?? x.summary ?? ""),
  }));

  const isDone = x.status !== "pending";

  const applyPayload = (): Record<string, unknown> => {
    switch (x.kind) {
      case "contact":
        if (matchedId) return { matchedContactId: matchedId };
        return {
          name: draft.name.trim(),
          organisationName: draft.organisationName.trim() || undefined,
          role: draft.role.trim() || undefined,
          geography: draft.geography.trim() || undefined,
          notes: draft.notes.trim() || undefined,
        };
      case "organisation":
        return {
          name: draft.orgName.trim(),
          type: draft.orgType.trim() || undefined,
          description: draft.orgDescription.trim() || undefined,
        };
      case "intro_request":
        return {
          title: draft.introTitle.trim() || undefined,
          body: draft.introBody.trim() || undefined,
        };
      default:
        return {};
    }
  };

  return (
    <div
      className={[
        "rounded-lg border p-4",
        isDone ? "border-charcoal/[0.06] bg-cream/50" : "border-charcoal/10 bg-cream",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kindBadgeClass(x.kind)}`}
        >
          {kindLabel(x.kind)}
        </span>
        {isDone ? (
          <span className="text-xs text-charcoal-light">
            {x.status === "applied" ? "Applied" : "Dismissed"}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-medium text-charcoal">{x.title}</p>
      {x.summary ? (
        <p className="mt-1 text-sm text-charcoal-light">{x.summary}</p>
      ) : null}
      {x.detail ? (
        <p className="mt-1 text-sm text-charcoal-light/90">{x.detail}</p>
      ) : null}

      {isDone && x.status === "applied" ? (
        <p className="mt-2 text-xs text-charcoal-light">
          {[
            x.createdContactId ? "Saved to contacts." : null,
            x.createdOrganisationId ? "Organisation added." : null,
            x.createdSuggestionId ? "Added to suggestions." : null,
          ]
            .filter(Boolean)
            .join(" ") || "Done."}
        </p>
      ) : null}

      {!isDone && editing ? (
        <div className="mt-3 space-y-3 border-t border-charcoal/[0.06] pt-3">
          {x.kind === "contact" && !matchedId ? (
            <>
              <Field
                id={`${x.id}-name`}
                label="Name"
                value={draft.name}
                onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
              />
              <Field
                id={`${x.id}-org`}
                label="Organisation"
                value={draft.organisationName}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, organisationName: v }))
                }
              />
              <Field
                id={`${x.id}-role`}
                label="Role"
                value={draft.role}
                onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
              />
              <Field
                id={`${x.id}-geo`}
                label="Geography"
                value={draft.geography}
                onChange={(v) => setDraft((d) => ({ ...d, geography: v }))}
              />
              <div>
                <label
                  htmlFor={`${x.id}-notes`}
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Notes
                </label>
                <textarea
                  id={`${x.id}-notes`}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  rows={2}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                />
              </div>
            </>
          ) : null}
          {x.kind === "contact" && matchedId ? (
            <p className="text-sm text-charcoal-light">
              Existing contact in workspace — Rex will set{" "}
              <strong>last contact date</strong> from this email (
              {new Date(receivedAt).toLocaleDateString()}).
            </p>
          ) : null}
          {x.kind === "organisation" ? (
            <>
              <Field
                id={`${x.id}-oname`}
                label="Name"
                value={draft.orgName}
                onChange={(v) => setDraft((d) => ({ ...d, orgName: v }))}
              />
              <Field
                id={`${x.id}-otype`}
                label="Type"
                value={draft.orgType}
                onChange={(v) => setDraft((d) => ({ ...d, orgType: v }))}
              />
              <div>
                <label
                  htmlFor={`${x.id}-odesc`}
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Description
                </label>
                <textarea
                  id={`${x.id}-odesc`}
                  value={draft.orgDescription}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      orgDescription: e.target.value,
                    }))
                  }
                  rows={2}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                />
              </div>
            </>
          ) : null}
          {x.kind === "intro_request" ? (
            <>
              <Field
                id={`${x.id}-ititle`}
                label="Title"
                value={draft.introTitle}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, introTitle: v }))
                }
              />
              <div>
                <label
                  htmlFor={`${x.id}-ibody`}
                  className={WORKSPACE_FORM_LABEL_CLASS}
                >
                  Details
                </label>
                <textarea
                  id={`${x.id}-ibody`}
                  value={draft.introBody}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, introBody: e.target.value }))
                  }
                  rows={3}
                  className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!isDone ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {x.kind === "contact" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onPatch(x.id, { action: "dismiss" })}
                className={WORKSPACE_FORM_BTN_SECONDARY}
              >
                Ignore
              </button>
              {!matchedId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onToggleEdit}
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                >
                  {editing ? "Close edit" : "Edit"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onPatch(x.id, {
                    action: "apply",
                    payload: applyPayload(),
                  })
                }
                className={WORKSPACE_FORM_BTN_PRIMARY}
              >
                {matchedId ? "Record touch" : "Add to network"}
              </button>
            </>
          ) : null}
          {x.kind === "organisation" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onPatch(x.id, { action: "dismiss" })}
                className={WORKSPACE_FORM_BTN_SECONDARY}
              >
                Ignore
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onToggleEdit}
                className={WORKSPACE_FORM_BTN_SECONDARY}
              >
                {editing ? "Close edit" : "Edit"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onPatch(x.id, {
                    action: "apply",
                    payload: applyPayload(),
                  })
                }
                className={WORKSPACE_FORM_BTN_PRIMARY}
              >
                Add organisation
              </button>
            </>
          ) : null}
          {x.kind === "intro_request" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onPatch(x.id, { action: "dismiss" })}
                className={WORKSPACE_FORM_BTN_SECONDARY}
              >
                Ignore
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onToggleEdit}
                className={WORKSPACE_FORM_BTN_SECONDARY}
              >
                {editing ? "Close edit" : "Edit"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onPatch(x.id, {
                    action: "apply",
                    payload: applyPayload(),
                  })
                }
                className={WORKSPACE_FORM_BTN_PRIMARY}
              >
                Add to suggestions
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div>
      <label htmlFor={id} className={WORKSPACE_FORM_LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className={WORKSPACE_FORM_INPUT_CLASS}
      />
    </div>
  );
}
