import type { SupabaseClient } from "@supabase/supabase-js";
import type { RexEmailExtractionKind } from "@/lib/data/workspace-emails.types";
import {
  insertDealStageHistory,
  insertWorkspaceContact,
  insertWorkspaceDeal,
  insertWorkspaceOrganisation,
  insertWorkspaceSuggestion,
  touchWorkspaceContactLastContactDate,
} from "@/lib/data/workspace-mutations";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function optNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mergePayload(
  base: Record<string, unknown>,
  overrides?: Record<string, unknown> | null,
): Record<string, unknown> {
  const out = { ...base };
  if (!overrides) return out;
  for (const [k, val] of Object.entries(overrides)) {
    if (val !== undefined) out[k] = val;
  }
  return out;
}

export async function fetchPendingExtractionForEmail(
  client: SupabaseClient,
  emailId: string,
  extractionId: string,
): Promise<{
  id: string;
  kind: RexEmailExtractionKind;
  payload: Record<string, unknown>;
  status: string;
} | null> {
  const { data, error } = await client
    .from("rex_email_extractions")
    .select("id,email_id,kind,status,payload")
    .eq("id", extractionId)
    .eq("email_id", emailId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  if (row.status !== "pending") return null;
  const kind = row.kind;
  if (
    kind !== "contact" &&
    kind !== "organisation" &&
    kind !== "deal_signal" &&
    kind !== "intro_request"
  ) {
    return null;
  }
  const payloadRaw = row.payload;
  const payload =
    payloadRaw != null &&
    typeof payloadRaw === "object" &&
    !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    kind,
    payload,
    status: String(row.status),
  };
}

type ApplyResult = {
  createdContactId: string | null;
  createdOrganisationId: string | null;
  createdDealId: string | null;
  createdSuggestionId: string | null;
};

async function markApplied(
  client: SupabaseClient,
  extractionId: string,
  ids: ApplyResult,
): Promise<void> {
  const { error } = await client
    .from("rex_email_extractions")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      created_contact_id: ids.createdContactId,
      created_organisation_id: ids.createdOrganisationId,
      created_deal_id: ids.createdDealId,
      created_suggestion_id: ids.createdSuggestionId,
    })
    .eq("id", extractionId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function dismissRexEmailExtraction(
  client: SupabaseClient,
  emailId: string,
  extractionId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("rex_email_extractions")
    .update({
      status: "dismissed",
      applied_at: new Date().toISOString(),
    })
    .eq("id", extractionId)
    .eq("email_id", emailId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function applyRexEmailExtraction(
  client: SupabaseClient,
  params: {
    emailId: string;
    extractionId: string;
    receivedAt: string;
    payloadOverrides?: Record<string, unknown> | null;
  },
): Promise<
  { ok: true; result: ApplyResult } | { ok: false; error: string }
> {
  const row = await fetchPendingExtractionForEmail(
    client,
    params.emailId,
    params.extractionId,
  );
  if (!row) {
    return { ok: false, error: "Extraction not found or already handled." };
  }

  const p = mergePayload(row.payload, params.payloadOverrides);
  const empty: ApplyResult = {
    createdContactId: null,
    createdOrganisationId: null,
    createdDealId: null,
    createdSuggestionId: null,
  };

  try {
    switch (row.kind) {
      case "contact": {
        const matched = optStr(p.matchedContactId);
        if (matched) {
          const ok = await touchWorkspaceContactLastContactDate(
            client,
            matched,
            params.receivedAt,
          );
          if (!ok) {
            return { ok: false, error: "Matched contact not found." };
          }
          await markApplied(client, params.extractionId, {
            ...empty,
            createdContactId: matched,
          });
          return {
            ok: true,
            result: { ...empty, createdContactId: matched },
          };
        }
        const name = str(p.name).trim();
        if (!name) {
          return { ok: false, error: "Contact name is required." };
        }
        let organisationId: string | null = optStr(p.organisationId);
        let createdOrganisationId: string | null = null;
        const orgName = str(p.organisationName).trim();
        if (!organisationId && orgName) {
          const org = await insertWorkspaceOrganisation(client, {
            name: orgName,
            type: optStr(p.organisationType),
            description: optStr(p.organisationDescription),
          });
          organisationId = org.id;
          createdOrganisationId = org.id;
        }
        const contact = await insertWorkspaceContact(client, {
          name,
          contact_type: optStr(p.contactType) ?? "Other",
          sector: optStr(p.sector) ?? "Other",
          organisation_id: organisationId,
          role: optStr(p.role),
          geography: optStr(p.geography),
          phone: optStr(p.phone),
          email: optStr(p.email),
          notes: optStr(p.notes),
        });
        await markApplied(client, params.extractionId, {
          ...empty,
          createdContactId: contact.id,
          createdOrganisationId,
        });
        return {
          ok: true,
          result: {
            ...empty,
            createdContactId: contact.id,
            createdOrganisationId,
          },
        };
      }
      case "organisation": {
        const name = str(p.name).trim();
        if (!name) {
          return { ok: false, error: "Organisation name is required." };
        }
        const org = await insertWorkspaceOrganisation(client, {
          name,
          type: optStr(p.type),
          description: optStr(p.description),
        });
        await markApplied(client, params.extractionId, {
          ...empty,
          createdOrganisationId: org.id,
        });
        return {
          ok: true,
          result: { ...empty, createdOrganisationId: org.id },
        };
      }
      case "deal_signal": {
        const title = str(p.title).trim();
        if (!title) {
          return { ok: false, error: "Deal title is required." };
        }
        const deal = await insertWorkspaceDeal(client, {
          title,
          size: optNum(p.size),
          deal_type: optStr(p.dealType),
          deal_stage: "prospect",
          sector: optStr(p.sector),
          structure: optStr(p.structure),
          status: optStr(p.status) ?? "live",
          notes: optStr(p.notes),
        });
        await insertDealStageHistory(client, {
          deal_id: deal.id,
          from_stage: null,
          to_stage: deal.deal_stage,
        });
        await markApplied(client, params.extractionId, {
          ...empty,
          createdDealId: deal.id,
        });
        return {
          ok: true,
          result: { ...empty, createdDealId: deal.id },
        };
      }
      case "intro_request": {
        const title =
          optStr(p.title) ?? optStr(p.summary) ?? "Introduction request";
        const body = optStr(p.body) ?? optStr(p.detail) ?? optStr(p.context);
        const sug = await insertWorkspaceSuggestion(client, {
          title,
          body,
        });
        await markApplied(client, params.extractionId, {
          ...empty,
          createdSuggestionId: sug.id,
        });
        return {
          ok: true,
          result: { ...empty, createdSuggestionId: sug.id },
        };
      }
      default:
        return { ok: false, error: "Unknown extraction kind." };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    return { ok: false, error: message };
  }
}

export async function confirmAllPendingRexEmailExtractions(
  client: SupabaseClient,
  params: { emailId: string; receivedAt: string },
): Promise<{
  applied: number;
  errors: string[];
}> {
  const { data, error } = await client
    .from("rex_email_extractions")
    .select("id")
    .eq("email_id", params.emailId)
    .eq("status", "pending");
  if (error) throw error;
  const ids = (Array.isArray(data) ? data : []).map((r) =>
    String((r as Record<string, unknown>).id ?? ""),
  );
  const errors: string[] = [];
  let applied = 0;
  for (const id of ids) {
    if (!id) continue;
    const res = await applyRexEmailExtraction(client, {
      emailId: params.emailId,
      extractionId: id,
      receivedAt: params.receivedAt,
    });
    if (res.ok) applied += 1;
    else errors.push(res.error);
  }
  return { applied, errors };
}
