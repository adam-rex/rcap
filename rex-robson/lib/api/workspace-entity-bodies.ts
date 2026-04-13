import {
  parseOptionalNumber,
  parseOptionalString,
  parseOptionalUuid,
  parseRequiredString,
} from "@/lib/api/workspace-post-parse";

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
  organisationId: string | null;
  role: string | null;
  geography: string | null;
  notes: string | null;
};

export function parseContactUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: ContactUpsertBody }
  | { ok: false; error: string } {
  const name = parseRequiredString(body, "name", 300);
  if (!name.ok) return name;
  const organisationId = parseOptionalUuid(body, "organisationId");
  if (!organisationId.ok) return organisationId;
  const role = parseOptionalString(body, "role", 300);
  if (!role.ok) return role;
  const geography = parseOptionalString(body, "geography", 500);
  if (!geography.ok) return geography;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      name: name.value,
      organisationId: organisationId.value,
      role: role.value,
      geography: geography.value,
      notes: notes.value,
    },
  };
}

export type DealUpsertBody = {
  title: string;
  size: number | null;
  dealType: string | null;
  sector: string | null;
  structure: string | null;
  status: string | null;
  notes: string | null;
};

export function parseDealUpsertBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: DealUpsertBody }
  | { ok: false; error: string } {
  const title = parseRequiredString(body, "title", 300);
  if (!title.ok) return title;
  const size = parseOptionalNumber(body, "size");
  if (!size.ok) return size;
  const dealType = parseOptionalString(body, "dealType", 200);
  if (!dealType.ok) return dealType;
  const sector = parseOptionalString(body, "sector", 200);
  if (!sector.ok) return sector;
  const structure = parseOptionalString(body, "structure", 200);
  if (!structure.ok) return structure;
  const status = parseOptionalString(body, "status", 200);
  if (!status.ok) return status;
  const notes = parseOptionalString(body, "notes", 8000);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      title: title.value,
      size: size.value,
      dealType: dealType.value,
      sector: sector.value,
      structure: structure.value,
      status: status.value,
      notes: notes.value,
    },
  };
}
