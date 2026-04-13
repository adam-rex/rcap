"use client";

import { ArrowLeft, Mail, Paperclip } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  WORKSPACE_EMAILS_PAGE_SIZE_DEFAULT,
  type WorkspaceEmailExtractionListItem,
  type WorkspaceEmailListRow,
} from "@/lib/data/workspace-emails.types";
import { RexEmailInboxCard } from "./rex-email-inbox-card";
import { WorkspaceBrowsePagination } from "./workspace-browse-pagination";
import {
  WORKSPACE_BROWSE_ROW_BUTTON_CLASS,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
} from "./workspace-create-dialog";

type ApiListOk = { rows: WorkspaceEmailListRow[]; total: number };
type ApiErr = { error?: string; hint?: string };

type DetailAttachment = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  canDownload: boolean;
};

type EmailDetail = {
  id: string;
  receivedAt: string;
  fromName: string | null;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  threadParticipantCount: number | null;
  attachments: DetailAttachment[];
  extractions: WorkspaceEmailExtractionListItem[];
};

function formatListDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatDetailDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fromLine(row: WorkspaceEmailListRow): string {
  const name = row.fromName?.trim();
  if (name) return `${name} <${row.fromAddress}>`;
  return row.fromAddress;
}

export function EmailsBrowsePanel() {
  const pageSize = WORKSPACE_EMAILS_PAGE_SIZE_DEFAULT;
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WorkspaceEmailListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedQuery !== "") {
      params.set("q", debouncedQuery);
    }
    try {
      const res = await fetch(`/api/workspace/emails?${params.toString()}`);
      const data = (await res.json()) as ApiListOk & ApiErr;
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setError(parts.length > 0 ? parts.join(" ") : "Could not load emails.");
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setRows([]);
      setTotal(0);
      setError("Network error while loading emails.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  useEffect(() => {
    if (page !== safePage && safePage >= 1) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await fetch(`/api/workspace/emails/${id}`);
      const data = (await res.json()) as EmailDetail & ApiErr;
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        setDetailError(parts.length > 0 ? parts.join(" ") : "Could not load email.");
        return;
      }
      const extRaw = data.extractions;
      const extractions: WorkspaceEmailExtractionListItem[] = Array.isArray(
        extRaw,
      )
        ? (extRaw as WorkspaceEmailExtractionListItem[])
        : [];
      const tpc = data.threadParticipantCount;
      const threadParticipantCount =
        typeof tpc === "number" && Number.isFinite(tpc)
          ? tpc
          : null;

      setDetail({
        id: data.id,
        receivedAt: data.receivedAt,
        fromName: data.fromName,
        fromAddress: data.fromAddress,
        toAddresses: Array.isArray(data.toAddresses) ? data.toAddresses : [],
        subject: data.subject ?? "",
        bodyText: data.bodyText ?? null,
        bodyHtml: data.bodyHtml ?? null,
        snippet: data.snippet ?? null,
        threadParticipantCount,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        extractions,
      });
    } catch {
      setDetailError("Network error while loading email.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const selectRow = (id: string) => {
    setSelectedId(id);
    void loadDetail(id);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  };

  const refreshEmailAndList = useCallback(() => {
    if (selectedId) void loadDetail(selectedId);
    void loadList();
  }, [selectedId, loadDetail, loadList]);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(queryInput.trim());
    setPage(1);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Inbox list */}
      <div
        className={[
          "flex min-h-0 w-full shrink-0 flex-col border-charcoal/[0.08] lg:w-[min(100%,380px)] lg:border-r",
          selectedId ? "hidden lg:flex" : "flex",
        ].join(" ")}
      >
        <div className="shrink-0 px-4 pb-3 pt-6 sm:px-6 lg:px-4 lg:pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl tracking-tight text-charcoal">
                Emails
              </h2>
              <p className="mt-1 text-xs text-charcoal-light/80">
                {loading
                  ? "Loading…"
                  : total === 0
                    ? debouncedQuery
                      ? "No matches for that search."
                      : "No messages yet. When Rex is copied or forwarded on email, they will appear here."
                    : `Showing ${from}–${to} of ${total}`}
              </p>
            </div>
          </div>
          <form onSubmit={onSearchSubmit} className="mt-4 block">
            <label htmlFor="emails-search" className={WORKSPACE_FORM_LABEL_CLASS}>
              Search
            </label>
            <input
              id="emails-search"
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Subject, sender, snippet…"
              autoComplete="off"
              className={WORKSPACE_FORM_INPUT_CLASS}
            />
          </form>
        </div>

        {error ? (
          <p className="shrink-0 px-4 text-sm text-red-700/90 sm:px-6 lg:px-4" role="alert">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-charcoal/[0.06] border-t border-charcoal/[0.06]">
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <li key={i} className="animate-pulse px-4 py-3 sm:px-6 lg:px-4">
                    <div className="h-4 w-48 rounded bg-charcoal/10" />
                    <div className="mt-2 h-3 w-full rounded bg-charcoal/5" />
                  </li>
                ))
              : rows.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => selectRow(row.id)}
                        className={[
                          WORKSPACE_BROWSE_ROW_BUTTON_CLASS,
                          "items-center py-3",
                          active ? "bg-charcoal/[0.06]" : "",
                        ].join(" ")}
                        aria-current={active ? "true" : undefined}
                      >
                        <Mail
                          className="mt-0.5 size-4 shrink-0 text-charcoal-light/70"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium text-charcoal">
                              <span className="truncate">
                                {row.subject || "(No subject)"}
                              </span>
                              {(row.pendingReviewCount ?? 0) > 0 ? (
                                <span className="ml-2 inline-flex shrink-0 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-sky-950">
                                  {row.pendingReviewCount} to review
                                </span>
                              ) : null}
                            </p>
                            <time
                              className="shrink-0 text-[11px] tabular-nums text-charcoal-light/75"
                              dateTime={row.receivedAt}
                            >
                              {formatListDate(row.receivedAt)}
                            </time>
                          </div>
                          <p className="truncate text-xs text-charcoal-light/85">
                            {fromLine(row)}
                          </p>
                          {row.snippet ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-charcoal-light/70">
                              {row.snippet}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
          </ul>
        </div>

        <div className="shrink-0 px-4 pb-6 sm:px-6 lg:px-4">
          <WorkspaceBrowsePagination
            ariaLabel="Emails pagination"
            safePage={safePage}
            totalPages={totalPages}
            loading={loading}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Detail pane */}
      <div
        className={[
          "flex min-h-[50vh] flex-1 flex-col bg-cream-light/30 lg:min-h-0",
          selectedId ? "flex" : "hidden lg:flex",
        ].join(" ")}
      >
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <Mail
              className="size-10 text-charcoal/15"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="mt-4 max-w-sm text-sm text-charcoal-light">
              Select a message to read the full thread and attachments Rex can
              access.
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-charcoal/[0.08] px-4 py-3 sm:px-6 lg:px-6">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg p-2 text-charcoal-light hover:bg-charcoal/[0.06] lg:hidden"
                aria-label="Back to inbox"
              >
                <ArrowLeft className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-charcoal-light lg:hidden">
                Inbox
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:py-6">
              {detailLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-6 w-3/4 max-w-md rounded bg-charcoal/10" />
                  <div className="h-4 w-40 rounded bg-charcoal/5" />
                  <div className="mt-6 h-32 w-full rounded bg-charcoal/5" />
                </div>
              ) : detailError ? (
                <p className="text-sm text-red-700/90" role="alert">
                  {detailError}
                </p>
              ) : detail ? (
                <article className="max-w-3xl">
                  {detail.extractions.length > 0 ? (
                    <RexEmailInboxCard
                      emailId={detail.id}
                      receivedAt={detail.receivedAt}
                      fromName={detail.fromName}
                      fromAddress={detail.fromAddress}
                      toAddresses={detail.toAddresses}
                      subject={detail.subject}
                      threadParticipantCount={detail.threadParticipantCount}
                      extractions={detail.extractions}
                      onRefresh={refreshEmailAndList}
                    />
                  ) : (
                    <>
                      <h3 className="font-serif text-lg font-normal tracking-tight text-charcoal">
                        {detail.subject || "(No subject)"}
                      </h3>
                      <dl className="mt-4 space-y-2 border-b border-charcoal/[0.08] pb-4 text-sm">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          <dt className="w-20 shrink-0 text-charcoal-light">
                            From
                          </dt>
                          <dd className="min-w-0 text-charcoal">
                            {detail.fromName
                              ? `${detail.fromName} <${detail.fromAddress}>`
                              : detail.fromAddress}
                          </dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          <dt className="w-20 shrink-0 text-charcoal-light">To</dt>
                          <dd className="min-w-0 break-all text-charcoal">
                            {detail.toAddresses.length > 0
                              ? detail.toAddresses.join(", ")
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          <dt className="w-20 shrink-0 text-charcoal-light">
                            Date
                          </dt>
                          <dd className="text-charcoal">
                            <time dateTime={detail.receivedAt}>
                              {formatDetailDate(detail.receivedAt)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                    </>
                  )}

                  {detail.extractions.length > 0 ? (
                    <div className="mt-6 border-t border-charcoal/[0.08] pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-charcoal-light/80">
                        Source message
                      </p>
                      <p className="mt-1 text-sm text-charcoal-light">
                        <time dateTime={detail.receivedAt}>
                          {formatDetailDate(detail.receivedAt)}
                        </time>
                      </p>
                    </div>
                  ) : null}

                  {detail.attachments.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-charcoal-light/80">
                        <Paperclip className="size-3.5" strokeWidth={2} aria-hidden />
                        Attachments
                      </p>
                      <ul className="flex flex-col gap-2">
                        {detail.attachments.map((a) => (
                          <li key={a.id}>
                            {a.canDownload ? (
                              <a
                                href={`/api/workspace/emails/${detail.id}/attachments/${a.id}`}
                                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal transition-colors hover:bg-charcoal/[0.04]"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="truncate font-medium">
                                  {a.filename}
                                </span>
                                {formatFileSize(a.sizeBytes) ? (
                                  <span className="shrink-0 text-xs text-charcoal-light">
                                    {formatFileSize(a.sizeBytes)}
                                  </span>
                                ) : null}
                              </a>
                            ) : (
                              <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-dashed border-charcoal/20 bg-cream/80 px-3 py-2 text-sm text-charcoal-light">
                                <span className="truncate">{a.filename}</span>
                                <span className="shrink-0 text-xs">
                                  File not in storage yet
                                </span>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-6 max-w-none text-charcoal">
                    {detail.bodyHtml ? (
                      <iframe
                        title="Email body"
                        sandbox=""
                        srcDoc={detail.bodyHtml}
                        className="min-h-[240px] w-full rounded-lg border border-charcoal/10 bg-cream"
                      />
                    ) : detail.bodyText ? (
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-charcoal">
                        {detail.bodyText}
                      </pre>
                    ) : detail.snippet ? (
                      <p className="text-sm text-charcoal-light">{detail.snippet}</p>
                    ) : (
                      <p className="text-sm text-charcoal-light">
                        No body text for this message.
                      </p>
                    )}
                  </div>
                </article>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
