import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRolesList } from "@/lib/constants/contact-roles";
import type {
  WorkspaceContactPageRow,
  WorkspaceContactsPageResult,
} from "@/lib/data/workspace-contacts.types";
import {
  WORKSPACE_CONTACTS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-contacts.types";

export type { WorkspaceContactPageRow, WorkspaceContactsPageResult };
export {
  WORKSPACE_CONTACTS_PAGE_SIZE_DEFAULT,
  WORKSPACE_CONTACTS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-contacts.types";

/** First trimmed non-empty string, or null (handles `""` so we never keep blank scalars). */
function firstNonEmptyText(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const c of candidates) {
    if (c == null) continue;
    const t = String(c).trim();
    if (t.length > 0) return t;
  }
  return null;
}

function rpcText(
  x: Record<string, unknown>,
  snake: string,
  camel?: string,
): string | null {
  const raw = camel != null ? (x[snake] ?? x[camel]) : x[snake];
  return firstNonEmptyText(raw == null ? null : String(raw));
}

function parseRpcPayload(data: unknown): WorkspaceContactsPageResult {
  if (data == null || typeof data !== "object") {
    return { rows: [], total: 0 };
  }
  const o = data as { total?: unknown; rows?: unknown };
  const total = typeof o.total === "number" && Number.isFinite(o.total) ? o.total : 0;
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  const rows: WorkspaceContactPageRow[] = rowsRaw.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      name: String(x.name ?? ""),
      contact_type: rpcText(x, "contact_type", "contactType"),
      sector: rpcText(x, "sector"),
      role: rpcText(x, "role"),
      roles: sanitizeRolesList(x.roles),
      geography: rpcText(x, "geography"),
      last_contact_date:
        x.last_contact_date == null ? null : String(x.last_contact_date),
      organisation_id:
        x.organisation_id == null ? null : String(x.organisation_id),
      organisation_name: rpcText(x, "organisation_name", "organisationName"),
      organisation_type: rpcText(x, "organisation_type", "organisationType"),
      internal_owner: rpcText(x, "internal_owner", "internalOwner"),
    };
  });
  return { rows, total };
}

/**
 * Older `workspace_contacts_page` RPCs may omit newer columns. Merge from `contacts`
 * so the list UI stays correct without requiring every migration to be replayed.
 * Tries successively narrower selects so missing-column DBs still merge what they can.
 */
async function mergeContactListExtrasFromTable(
  client: SupabaseClient,
  rows: WorkspaceContactPageRow[],
): Promise<WorkspaceContactPageRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id).filter((id) => id.length > 0);

  const selects = [
    "id,contact_type,sector,internal_owner,roles",
    "id,contact_type,sector,internal_owner",
    "id,contact_type,sector",
  ];

  let data: Record<string, unknown>[] | null = null;
  for (let i = 0; i < selects.length; i += 1) {
    const sel = selects[i]!;
    const res = await client.from("contacts").select(sel).in("id", ids);
    if (!res.error) {
      data = (res.data ?? []) as unknown as Record<string, unknown>[];
      break;
    }
    const code = (res.error as { code?: string }).code;
    if (code !== "42703" && code !== "PGRST204") throw res.error;
    if (i === selects.length - 1) return rows;
  }
  if (!data?.length) return rows;

  const byId = new Map(
    data.map((d) => {
      const rec = d;
      const ct = rec.contact_type ?? rec.contactType;
      const sec = rec.sector;
      const io = rec.internal_owner ?? rec.internalOwner;
      return [
        String(rec.id ?? ""),
        {
          contact_type: firstNonEmptyText(
            ct == null ? null : String(ct),
          ),
          sector: firstNonEmptyText(sec == null ? null : String(sec)),
          internal_owner: firstNonEmptyText(io == null ? null : String(io)),
          roles: sanitizeRolesList(rec.roles),
          hasRoles: Object.prototype.hasOwnProperty.call(rec, "roles"),
        },
      ];
    }),
  );
  return rows.map((r) => {
    const extra = byId.get(r.id);
    if (!extra) return r;
    return {
      ...r,
      contact_type: firstNonEmptyText(extra.contact_type, r.contact_type),
      sector: firstNonEmptyText(extra.sector, r.sector),
      internal_owner: firstNonEmptyText(
        extra.internal_owner,
        r.internal_owner,
      ),
      // Prefer canonical roles from the contacts table when present (RPC may
      // not have been bumped yet). Fall back to whatever the RPC returned.
      roles: extra.hasRoles ? extra.roles : r.roles,
    };
  });
}

function isMissingRpcSignatureError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  // 42883 = undefined_function in Postgres (signature mismatch). PostgREST also
  // surfaces this on RPC calls where the named arg list doesn't match a function.
  if (e.code === "42883" || e.code === "PGRST202") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("workspace_contacts_page") &&
    (msg.includes("does not exist") ||
      msg.includes("no function matches") ||
      msg.includes("could not find"))
  );
}

export async function fetchWorkspaceContactsPageWithClient(
  client: SupabaseClient,
  params: {
    search: string | null;
    page: number;
    pageSize: number;
    role: string | null;
    organisationType: string | null;
    contactType: string | null;
    sectors: string[];
    roles: string[];
  },
): Promise<WorkspaceContactsPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_CONTACTS_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );

  const baseArgs = {
    p_search: params.search ?? "",
    p_page: page,
    p_page_size: pageSize,
    p_role: params.role ?? "",
    p_organisation_type: params.organisationType ?? "",
    p_contact_type: params.contactType ?? "",
    p_sectors: params.sectors,
  };

  let data: unknown = null;
  let usedLegacyRpc = false;
  {
    const res = await client.rpc("workspace_contacts_page", {
      ...baseArgs,
      p_roles: params.roles,
    });
    if (res.error) {
      if (isMissingRpcSignatureError(res.error)) {
        const retry = await client.rpc("workspace_contacts_page", baseArgs);
        if (retry.error) throw retry.error;
        data = retry.data;
        usedLegacyRpc = true;
      } else {
        throw res.error;
      }
    } else {
      data = res.data;
    }
  }

  const parsed = parseRpcPayload(data);
  let rows = await mergeContactListExtrasFromTable(client, parsed.rows);

  // If the RPC didn't filter by roles (legacy signature), apply OR semantics
  // client-side so the user-facing filter still works on stale DBs.
  let total = parsed.total;
  if (usedLegacyRpc && params.roles.length > 0) {
    const wanted = new Set(params.roles);
    const filtered = rows.filter((r) => r.roles.some((x) => wanted.has(x)));
    rows = filtered;
    total = filtered.length;
  }

  return { rows, total };
}

/**
 * Server-side contacts page (search + pagination). Prefer service role when set.
 */
export async function getWorkspaceContactsPage(params: {
  search: string | null;
  page: number;
  pageSize: number;
  role: string | null;
  organisationType: string | null;
  contactType: string | null;
  sectors: string[];
  roles: string[];
}): Promise<WorkspaceContactsPageResult> {
  const client = await createServerSupabaseClient();
  return fetchWorkspaceContactsPageWithClient(client, params);
}
