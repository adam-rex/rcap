import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  WorkspaceOrganisationPageRow,
  WorkspaceOrganisationsPageResult,
} from "@/lib/data/workspace-organisations-page.types";
import { WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX } from "@/lib/data/workspace-organisations-page.types";

export type { WorkspaceOrganisationPageRow, WorkspaceOrganisationsPageResult };
export {
  WORKSPACE_ORGANISATIONS_PAGE_SIZE_DEFAULT,
  WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-organisations-page.types";

function parseRpcPayload(data: unknown): WorkspaceOrganisationsPageResult {
  if (data == null || typeof data !== "object") {
    return { rows: [], total: 0 };
  }
  const o = data as { total?: unknown; rows?: unknown };
  const total = typeof o.total === "number" && Number.isFinite(o.total) ? o.total : 0;
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  const rows: WorkspaceOrganisationPageRow[] = rowsRaw.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      name: String(x.name ?? ""),
      type: x.type == null ? null : String(x.type),
      description: x.description == null ? null : String(x.description),
    };
  });
  return { rows, total };
}

export async function fetchWorkspaceOrganisationsPageWithClient(
  client: SupabaseClient,
  params: { search: string | null; page: number; pageSize: number },
): Promise<WorkspaceOrganisationsPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(
    WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(params.pageSize)),
  );

  const { data, error } = await client.rpc("workspace_organisations_page", {
    p_search: params.search ?? "",
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    throw error;
  }

  return parseRpcPayload(data);
}

export async function getWorkspaceOrganisationsPage(params: {
  search: string | null;
  page: number;
  pageSize: number;
}): Promise<WorkspaceOrganisationsPageResult> {
  const client = await createServerSupabaseClient();
  return fetchWorkspaceOrganisationsPageWithClient(client, params);
}
