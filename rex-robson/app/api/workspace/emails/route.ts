import { NextResponse } from "next/server";
import { sanitizeWorkspaceListSearch } from "@/lib/data/workspace-search-sanitize";
import {
  getWorkspaceEmailsPage,
  WORKSPACE_EMAILS_PAGE_SIZE_DEFAULT,
  WORKSPACE_EMAILS_PAGE_SIZE_MAX,
} from "@/lib/data/workspace-emails";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q") ?? url.searchParams.get("search") ?? "";
  const pageRaw = url.searchParams.get("page");
  const sizeRaw = url.searchParams.get("pageSize") ?? url.searchParams.get("limit");
  const mailboxRaw = url.searchParams.get("mailbox");
  const viewRaw = url.searchParams.get("view");

  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const pageSize = sizeRaw
    ? Number.parseInt(sizeRaw, 10)
    : WORKSPACE_EMAILS_PAGE_SIZE_DEFAULT;

  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  if (
    !Number.isFinite(pageSize) ||
    pageSize < 1 ||
    pageSize > WORKSPACE_EMAILS_PAGE_SIZE_MAX
  ) {
    return NextResponse.json(
      { error: `pageSize must be 1–${WORKSPACE_EMAILS_PAGE_SIZE_MAX}` },
      { status: 400 },
    );
  }

  const search = sanitizeWorkspaceListSearch(qRaw);
  const mailbox =
    mailboxRaw === "call_logs"
      ? "call_logs"
      : mailboxRaw === "emails" || mailboxRaw == null
        ? "emails"
        : null;
  if (mailbox === null) {
    return NextResponse.json(
      { error: "mailbox must be 'emails' or 'call_logs'" },
      { status: 400 },
    );
  }

  let emailView: "inbox" | "archived" | undefined;
  if (mailbox === "emails") {
    if (viewRaw == null || viewRaw === "" || viewRaw === "inbox") {
      emailView = "inbox";
    } else if (viewRaw === "archived") {
      emailView = "archived";
    } else {
      return NextResponse.json(
        { error: "view must be 'inbox' or 'archived'" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await getWorkspaceEmailsPage({
      search,
      page,
      pageSize,
      mailbox,
      emailView,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[rex-robson] GET /api/workspace/emails:", e);
    }
    return NextResponse.json(
      {
        error: message,
        hint:
          "Apply migration 20260413170000_rex_inbound_emails.sql if rex_inbound_emails is missing; add archived_at via 20260506120000_rex_inbound_emails_archived_at.sql.",
      },
      { status: 503 },
    );
  }
}
