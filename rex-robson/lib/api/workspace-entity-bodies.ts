import {
  isValidUuid,
  parseOptionalString,
  parseOptionalUuid,
  parseRequiredString,
} from "@/lib/api/workspace-post-parse";
import {
  INTERNAL_CONTACT_OWNERS,
  isInternalContactOwner,
} from "@/lib/constants/internal-contact-owners";

export type OrganisationUpsertBody = {
  name: string;
  type: string | null;
  description: string | null;
};

export function parseOrganisationUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: OrganisationUpsertBody }
  | { ok: false; error: string } {
  const name = parseRequiredString(body, "name", 300);
  if (!name.ok) return name;
  const type = parseOptionalString(body, "type", 200);
  if (!type.ok) return type;
  const description = parseOptionalString(body, "description", 8000);
  if (!description.ok) return description;
  return {
    ok: true,
    value: {
      name: name.value,
      type: type.value,
      description: description.value,
    },
  };
}

export type ContactUpsertBody = {
  name: string;
  contactType: string;
  sector: string;
  organisationId: string | null;
  role: string | null;
  geography: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Rex team member who added the contact (internal). */
  internalOwner: string | null;
};

export function parseContactUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: ContactUpsertBody }
  | { ok: false; error: string } {
  const name = parseRequiredString(body, "name", 300);
  if (!name.ok) return name;
  const contactType = parseRequiredString(body, "contactType", 40);
  if (!contactType.ok) return contactType;
  const sector = parseRequiredString(body, "sector", 200);
  if (!sector.ok) return sector;
  const organisationId = parseOptionalUuid(body, "organisationId");
  if (!organisationId.ok) return organisationId;
  const role = parseOptionalString(body, "role", 300);
  if (!role.ok) return role;
  const geography = parseOptionalString(body, "geography", 500);
  if (!geography.ok) return geography;
  const phone = parseOptionalString(body, "phone", 80);
  if (!phone.ok) return phone;
  const email = parseOptionalString(body, "email", 320);
  if (!email.ok) return email;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;
  const internalOwnerRaw = body["internalOwner"];
  let internalOwner: string | null = null;
  if (internalOwnerRaw != null) {
    if (typeof internalOwnerRaw !== "string") {
      return { ok: false, error: "internalOwner must be a string or null." };
    }
    const t = internalOwnerRaw.trim();
    if (t !== "") {
      if (!isInternalContactOwner(t)) {
        return {
          ok: false,
          error: `internalOwner must be one of: ${INTERNAL_CONTACT_OWNERS.join(", ")}.`,
        };
      }
      internalOwner = t;
    }
  }
  return {
    ok: true,
    value: {
      name: name.value,
      contactType: contactType.value,
      sector: sector.value,
      organisationId: organisationId.value,
      role: role.value,
      geography: geography.value,
      phone: phone.value,
      email: email.value,
      notes: notes.value,
      internalOwner,
    },
  };
}

export type MatchKind = "founder_investor" | "founder_lender";
/** Opportunity (pair) stage — not pipeline. */
export type OpportunityStage = "introduced" | "closed";
export type MatchOutcome = "won" | "lost" | "passed";
export type PipelineTransactionStage = "active" | "closed";

export type MatchUpsertBody = {
  contactAId: string;
  contactBId: string;
  kind: MatchKind;
  stage: OpportunityStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
};

function parseRequiredUuid(
  body: Record<string, unknown>,
  key: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const v = body[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    return { ok: false, error: `${key} is required` };
  }
  const t = v.trim();
  if (!isValidUuid(t)) {
    return { ok: false, error: `${key} must be a valid UUID` };
  }
  return { ok: true, value: t };
}

function parseKind(raw: string | null): MatchKind | null {
  return raw === "founder_investor" || raw === "founder_lender" ? raw : null;
}

function parseOpportunityStage(raw: string | null): OpportunityStage | null {
  return raw === "introduced" || raw === "closed" ? raw : null;
}

function parseOutcome(raw: string | null): MatchOutcome | null {
  return raw === "won" || raw === "lost" || raw === "passed" ? raw : null;
}

export function parseMatchUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: MatchUpsertBody }
  | { ok: false; error: string } {
  const contactAId = parseRequiredUuid(body, "contactAId");
  if (!contactAId.ok) return contactAId;
  const contactBId = parseRequiredUuid(body, "contactBId");
  if (!contactBId.ok) return contactBId;
  if (contactAId.value === contactBId.value) {
    return {
      ok: false,
      error: "contactAId and contactBId must reference different contacts.",
    };
  }
  const kindRaw = parseRequiredString(body, "kind", 40);
  if (!kindRaw.ok) return kindRaw;
  const kind = parseKind(kindRaw.value);
  if (!kind) {
    return {
      ok: false,
      error: "kind must be one of: founder_investor, founder_lender.",
    };
  }
  const stageRaw = parseOptionalString(body, "stage", 40);
  if (!stageRaw.ok) return stageRaw;
  const stageParsed = parseOpportunityStage(stageRaw.value);
  if (stageRaw.value != null && stageRaw.value.trim() !== "" && !stageParsed) {
    return {
      ok: false,
      error: "stage must be one of: introduced, closed.",
    };
  }
  const stage = stageParsed ?? "introduced";
  const outcomeRaw = parseOptionalString(body, "outcome", 40);
  if (!outcomeRaw.ok) return outcomeRaw;
  const outcome = stage === "closed" ? parseOutcome(outcomeRaw.value) : null;
  const context = parseOptionalString(body, "context", 8000);
  if (!context.ok) return context;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      contactAId: contactAId.value,
      contactBId: contactBId.value,
      kind,
      stage,
      outcome,
      context: context.value,
      notes: notes.value,
    },
  };
}

export type OpportunityStageBody = {
  stage: OpportunityStage;
  outcome: MatchOutcome | null;
};

export function parseOpportunityStageBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: OpportunityStageBody }
  | { ok: false; error: string } {
  const stageRaw = parseRequiredString(body, "stage", 40);
  if (!stageRaw.ok) return stageRaw;
  const stage = parseOpportunityStage(stageRaw.value);
  if (!stage) {
    return {
      ok: false,
      error: "stage must be one of: introduced, closed.",
    };
  }
  const outcomeRaw = parseOptionalString(body, "outcome", 40);
  if (!outcomeRaw.ok) return outcomeRaw;
  const outcome = stage === "closed" ? parseOutcome(outcomeRaw.value) : null;
  return { ok: true, value: { stage, outcome } };
}

export type MatchTransactionStageBody = {
  stage: PipelineTransactionStage;
  outcome: MatchOutcome | null;
};

export function parseMatchTransactionStageBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: MatchTransactionStageBody }
  | { ok: false; error: string } {
  const stageRaw = parseRequiredString(body, "stage", 40);
  if (!stageRaw.ok) return stageRaw;
  const st = stageRaw.value.trim();
  const stage: PipelineTransactionStage | null =
    st === "active" || st === "closed" ? st : null;
  if (!stage) {
    return {
      ok: false,
      error: "stage must be one of: active, closed.",
    };
  }
  const outcomeRaw = parseOptionalString(body, "outcome", 40);
  if (!outcomeRaw.ok) return outcomeRaw;
  const outcome = stage === "closed" ? parseOutcome(outcomeRaw.value) : null;
  return { ok: true, value: { stage, outcome } };
}

export type CreateMatchTransactionBody = {
  matchId: string;
  title: string | null;
  context: string | null;
  notes: string | null;
};

export function parseCreateMatchTransactionBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: CreateMatchTransactionBody }
  | { ok: false; error: string } {
  const matchId = parseRequiredUuid(body, "matchId");
  if (!matchId.ok) return matchId;
  const title = parseOptionalString(body, "title", 300);
  if (!title.ok) return title;
  const context = parseOptionalString(body, "context", 8000);
  if (!context.ok) return context;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      matchId: matchId.value,
      title: title.value,
      context: context.value,
      notes: notes.value,
    },
  };
}

export type MatchTransactionUpsertBody = {
  title: string | null;
  stage: PipelineTransactionStage;
  outcome: MatchOutcome | null;
  context: string | null;
  notes: string | null;
};

export function parseMatchTransactionUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: MatchTransactionUpsertBody }
  | { ok: false; error: string } {
  const title = parseOptionalString(body, "title", 300);
  if (!title.ok) return title;
  const stageRaw = parseRequiredString(body, "stage", 40);
  if (!stageRaw.ok) return stageRaw;
  const st = stageRaw.value.trim();
  const stage: PipelineTransactionStage | null =
    st === "active" || st === "closed" ? st : null;
  if (!stage) {
    return {
      ok: false,
      error: "stage must be one of: active, closed.",
    };
  }
  const outcomeRaw = parseOptionalString(body, "outcome", 40);
  if (!outcomeRaw.ok) return outcomeRaw;
  const outcome = stage === "closed" ? parseOutcome(outcomeRaw.value) : null;
  const context = parseOptionalString(body, "context", 8000);
  if (!context.ok) return context;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      title: title.value,
      stage,
      outcome,
      context: context.value,
      notes: notes.value,
    },
  };
}

/** @deprecated Use parseOpportunityStageBody */
export const parseMatchStageBody = parseOpportunityStageBody;
