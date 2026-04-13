import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  WorkspaceDealPageRow,
  WorkspaceDealsPageResult,
} from "@/lib/data/workspace-deals-page.types";
import { WORKSPACE_DEALS_PAGE_SIZE_MAX } from "@/lib/data/workspace-deals-page.types";

export type { WorkspaceDealPageRow, WorkspaceDealsPageResult };
export {
  WORKSPACE_DEALS_PAGE_SIZE_DEFAULT,
  WORKSPACE_DEALS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-deals-page.types";

function parseSize(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseRpcPayload(data: unknown): WorkspaceDealsPageResult {
  if (data == null || typeof data !== "object") {
    return { rows: [], total: 0 };
  }
  const o = data as { total?: unknown; rows?: unknown };
  const total = typeof o.total === "number" && Number.isFinite(o.total) ? o.total : 0;
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  const rows: WorkspaceDealPageRow[] = rowsRaw.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      title: String(x.title ?? ""),
      size: parseSize(x.size),
      deal_type: x.deal_type == null ? null : String(x.deal_type),
      sector: x.sector == null ? null : String(x.sector),
      structure: x.structure == null ? null : String(x.structure),
      status: x.status == null ? null : String(x.status),
    };
  });
  return { rows, total };
}

export async function fetchWorkspaceDealsPageWithClient(
  client: SupabaseClient,
  params: { search: string | null; page: number; pageSize: number },
): Promise<WorkspaceDealsPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_DEALS_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );

  const { data, error } = await client.rpc("workspace_deals_page", {
    p_search: params.search ?? "",
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    throw error;
  }

  return parseRpcPayload(data);
}

export async function getWorkspaceDealsPage(params: {
  search: string | null;
  page: number;
  pageSize: number;
}): Promise<WorkspaceDealsPageResult> {
  const service = tryCreateServiceRoleClient();
  const userScoped = await createServerSupabaseClient();
  const client = service ?? userScoped;
  return fetchWorkspaceDealsPageWithClient(client, params);
}
