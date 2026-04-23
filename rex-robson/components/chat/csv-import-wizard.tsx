"use client";

import { ArrowRight, ChevronLeft, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
} from "./workspace-create-dialog";

const MAX_FILE_CHARS = 512 * 1024;
const PREVIEW_ROWS_CAP = 500;
const LLM_SAMPLE_CHARS = 14_000;

type StepId = "map" | "review" | "save";

const REX_TARGETS = [
  { id: "contact_name", label: "Contact name" },
  { id: "organisation", label: "Organisation" },
  { id: "role", label: "Role" },
  {
    id: "notes_match_prefs",
    label: "Rex will extract match prefs from this",
  },
  { id: "skip", label: "Skip / enrich later" },
] as const;

type RexTargetId = (typeof REX_TARGETS)[number]["id"];

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      continue;
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];
  for (let i = 0; i < lines.length && rows.length < PREVIEW_ROWS_CAP; i += 1) {
    rows.push(parseCsvLine(lines[i]!));
  }
  return rows;
}

function guessTarget(header: string): RexTargetId {
  const h = header.toLowerCase();
  if (
    (/\bname\b/.test(h) || /\bfull/.test(h)) &&
    !/company|org|firm|employer|business/.test(h)
  ) {
    return "contact_name";
  }
  if (/company|org|organisation|organization|firm|employer|business/.test(h)) {
    return "organisation";
  }
  if (/title|role|job|position/.test(h)) {
    return "role";
  }
  if (/note|comment|memo|description|details/.test(h)) {
    return "notes_match_prefs";
  }
  if (/linkedin|url|website|link/.test(h)) {
    return "skip";
  }
  return "skip";
}

type UnderstandResponse = {
  understanding: string;
  content_kind?: string;
  subtitle?: string;
};

type CsvImportWizardProps = {
  filename: string;
  csvText: string;
  onClose: () => void;
  onGoToSuggestions?: () => void;
  /** Called from the Save step when the user finishes — parent can log to recents and dismiss. */
  onImportFinished?: (meta: { filename: string; dataRowCount: number }) => void;
};

function StepPill({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "upcoming";
}) {
  const cls =
    state === "done"
      ? "border border-emerald-200 bg-emerald-100/90 text-emerald-950"
      : state === "current"
        ? "border border-charcoal bg-charcoal text-cream"
        : "border border-charcoal/20 bg-transparent text-charcoal-light";
  return (
    <span
      className={
        "rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide " + cls
      }
    >
      {label}
    </span>
  );
}

export function CsvImportWizard({
  filename,
  csvText,
  onClose,
  onGoToSuggestions,
  onImportFinished,
}: CsvImportWizardProps) {
  const { headers, dataRows } = useMemo(() => {
    const rows = parseCsv(csvText);
    return {
      headers: rows[0] ?? [],
      dataRows: rows.slice(1),
    };
  }, [csvText]);

  const [step, setStep] = useState<StepId>("map");
  const [columnMap, setColumnMap] = useState<Record<number, RexTargetId>>(() => {
    const initial: Record<number, RexTargetId> = {};
    headers.forEach((h, i) => {
      initial[i] = guessTarget(h);
    });
    return initial;
  });

  const [understand, setUnderstand] = useState<UnderstandResponse | null>(null);
  const [understandLoading, setUnderstandLoading] = useState(false);
  const [understandError, setUnderstandError] = useState<string | null>(null);

  const mappedTargets = useMemo(() => {
    const used = new Set<RexTargetId>();
    headers.forEach((_, i) => {
      const t = columnMap[i] ?? "skip";
      if (t !== "skip") used.add(t);
    });
    return used;
  }, [headers, columnMap]);

  const previewColumns = useMemo(() => {
    const list: { header: string; colIndex: number; target: RexTargetId }[] =
      [];
    headers.forEach((h, i) => {
      const t = columnMap[i] ?? "skip";
      if (t === "skip") return;
      list.push({ header: h, colIndex: i, target: t });
    });
    return list;
  }, [headers, columnMap]);

  const contactCol = useMemo(() => {
    const entry = previewColumns.find((c) => c.target === "contact_name");
    return entry?.colIndex;
  }, [previewColumns]);

  const duplicateCount = useMemo(() => {
    if (contactCol === undefined) return 0;
    const seen = new Map<string, number>();
    for (const row of dataRows) {
      const v = (row[contactCol] ?? "").trim().toLowerCase();
      if (!v) continue;
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    let dups = 0;
    for (const n of seen.values()) {
      if (n > 1) dups += n - 1;
    }
    return dups;
  }, [dataRows, contactCol]);

  const fetchUnderstanding = useCallback(async () => {
    setUnderstandLoading(true);
    setUnderstandError(null);
    try {
      const res = await fetch("/api/rex/import-understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          sampleText: csvText.slice(0, LLM_SAMPLE_CHARS),
        }),
      });
      const data = (await res.json()) as UnderstandResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn’t analyse this file");
      }
      if (!data.understanding) {
        throw new Error("Unexpected response");
      }
      setUnderstand({
        understanding: data.understanding,
        content_kind: data.content_kind,
        subtitle: data.subtitle,
      });
    } catch (e) {
      setUnderstandError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setUnderstandLoading(false);
    }
  }, [filename, csvText]);

  useEffect(() => {
    if (step !== "review") return;
    if (understand !== null || understandLoading) return;
    void fetchUnderstanding();
  }, [step, understand, understandLoading, fetchUnderstanding]);

  const previewSlice = dataRows.slice(0, 8);
  const mapPreviewSlice = dataRows.slice(0, 3);
  const totalDataRows = dataRows.length;

  const footerSummary =
    contactCol !== undefined
      ? `${totalDataRows} row${totalDataRows === 1 ? "" : "s"} ready${
          duplicateCount > 0
            ? ` · ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} flagged`
            : ""
        }`
      : `${totalDataRows} row${totalDataRows === 1 ? "" : "s"} · map a contact column for duplicate checks`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-cream">
      <div className="flex shrink-0 items-center justify-between border-b border-charcoal/10 px-4 py-3 sm:px-6">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-charcoal">
          CSV import
        </h2>
        <div className="flex items-center gap-2">
          <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            <StepPill label="Upload" state="done" />
            <StepPill
              label="Map"
              state={
                step === "map" ? "current" : step === "review" || step === "save" ? "done" : "upcoming"
              }
            />
            <StepPill
              label="Review"
              state={
                step === "review"
                  ? "current"
                  : step === "save"
                    ? "done"
                    : "upcoming"
              }
            />
            <StepPill
              label="Save"
              state={step === "save" ? "current" : "upcoming"}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-charcoal-light hover:bg-charcoal/5"
            aria-label="Close import"
          >
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {step === "map" ? (
            <>
              {headers.length === 0 ? (
                <p className="text-sm text-charcoal-light">
                  This file doesn’t look like a CSV with a header row. Try a
                  different export or check the delimiter.
                </p>
              ) : null}
              <p className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                Map your columns to Rex fields
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {headers.map((header, i) => {
                  const target = columnMap[i] ?? "skip";
                  return (
                    <li
                      key={`${header}-${i}`}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-charcoal/10 bg-[#f0efe8] px-4 py-3 sm:flex-nowrap"
                    >
                      <span className="min-w-[120px] text-sm font-medium text-charcoal">
                        {header || `Column ${i + 1}`}
                      </span>
                      <ArrowRight
                        className="hidden size-4 shrink-0 text-charcoal-light sm:block"
                        aria-hidden
                      />
                      <select
                        className="min-w-0 flex-1 rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal outline-none focus:border-charcoal/25 focus:ring-2 focus:ring-charcoal/20"
                        value={target}
                        onChange={(e) => {
                          const next = e.target.value as RexTargetId;
                          setColumnMap((prev) => {
                            const copy = { ...prev };
                            if (next !== "skip") {
                              for (const k of Object.keys(copy)) {
                                const ki = Number(k);
                                if (copy[ki] === next && ki !== i) {
                                  copy[ki] = "skip";
                                }
                              }
                            }
                            copy[i] = next;
                            return copy;
                          });
                        }}
                      >
                        {REX_TARGETS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-8 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                Preview — {mapPreviewSlice.length} of {totalDataRows} rows
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-charcoal/10 bg-cream-light">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-charcoal/10 text-charcoal-light">
                      {previewColumns.map((c) => (
                        <th
                          key={c.colIndex}
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                        >
                          {REX_TARGETS.find((t) => t.id === c.target)?.label ??
                            c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapPreviewSlice.map((row, ri) => (
                      <tr
                        key={ri}
                        className="border-b border-charcoal/6 last:border-0"
                      >
                        {previewColumns.map((c) => (
                          <td
                            key={c.colIndex}
                            className="px-3 py-2.5 text-charcoal"
                          >
                            {row[c.colIndex] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-charcoal-light">{footerSummary}</p>
                <button
                  type="button"
                  className={WORKSPACE_FORM_BTN_PRIMARY + " inline-flex items-center gap-2 px-4 py-2.5 text-sm"}
                  disabled={headers.length === 0}
                  onClick={() => setStep("review")}
                >
                  Next: Review
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <div className="mb-6 flex items-center gap-2">
                <button
                  type="button"
                  className={
                    WORKSPACE_FORM_BTN_SECONDARY +
                    " inline-flex items-center gap-1"
                  }
                  onClick={() => setStep("map")}
                >
                  <ChevronLeft className="size-4" />
                  Map
                </button>
              </div>

              <UnderstandingCard
                filename={filename}
                data={understand}
                loading={understandLoading}
                error={understandError}
                onRetry={fetchUnderstanding}
              />

              <p className="mt-8 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
                Review before import — {previewSlice.length} of {totalDataRows}{" "}
                rows shown
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-charcoal/10 bg-cream-light">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-charcoal/10 text-charcoal-light">
                      {previewColumns.map((c) => (
                        <th
                          key={c.colIndex}
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                        >
                          {REX_TARGETS.find((t) => t.id === c.target)?.label ??
                            c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewSlice.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(1, previewColumns.length)}
                          className="px-3 py-6 text-center text-charcoal-light"
                        >
                          Map at least one column to see rows here.
                        </td>
                      </tr>
                    ) : (
                      previewSlice.map((row, ri) => (
                        <tr
                          key={ri}
                          className="border-b border-charcoal/6 last:border-0"
                        >
                          {previewColumns.map((c) => (
                            <td
                              key={c.colIndex}
                              className="max-w-[220px] truncate px-3 py-2.5 text-charcoal"
                              title={row[c.colIndex]}
                            >
                              {row[c.colIndex] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-charcoal-light">{footerSummary}</p>
                <button
                  type="button"
                  className={
                    WORKSPACE_FORM_BTN_PRIMARY +
                    " inline-flex items-center gap-2 px-4 py-2.5 text-sm"
                  }
                  onClick={() => setStep("save")}
                >
                  Next: Save
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </>
          ) : null}

          {step === "save" ? (
            <>
              <div className="mb-6 flex items-center gap-2">
                <button
                  type="button"
                  className={
                    WORKSPACE_FORM_BTN_SECONDARY +
                    " inline-flex items-center gap-1"
                  }
                  onClick={() => setStep("review")}
                >
                  <ChevronLeft className="size-4" />
                  Review
                </button>
              </div>

              <UnderstandingCard
                filename={filename}
                data={understand}
                loading={understandLoading}
                error={understandError}
                onRetry={fetchUnderstanding}
              />

              <p className="mt-6 text-sm text-charcoal-light">
                {mappedTargets.size === 0
                  ? "You haven’t mapped any Rex fields yet — go back to Map or confirm anyway for a later pass."
                  : `You’re about to stage ${totalDataRows} row${totalDataRows === 1 ? "" : "s"} with ${mappedTargets.size} mapped field type${mappedTargets.size === 1 ? "" : "s"}.`}
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                  onClick={() => {
                    onImportFinished?.({
                      filename,
                      dataRowCount: totalDataRows,
                    });
                    onGoToSuggestions?.();
                  }}
                >
                  Open suggestions
                </button>
                <button
                  type="button"
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                  onClick={() => {
                    onImportFinished?.({
                      filename,
                      dataRowCount: totalDataRows,
                    });
                  }}
                >
                  Done
                </button>
              </div>
              <p className="mt-4 text-xs text-charcoal-light">
                Saving to the workspace uses the import API once it’s wired —
                for now, use Suggestions after review.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UnderstandingCard({
  filename,
  data,
  loading,
  error,
  onRetry,
}: {
  filename: string;
  data: UnderstandResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  let body: ReactNode;
  if (loading) {
    body = (
      <p className="text-sm text-charcoal-light">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-500 align-middle" />{" "}
        Rex is reading{" "}
        <span className="font-medium text-charcoal">{filename}</span>…
      </p>
    );
  } else if (error) {
    body = (
      <div className="text-sm">
        <p className="text-charcoal">{error}</p>
        <button
          type="button"
          className={WORKSPACE_FORM_BTN_SECONDARY + " mt-3"}
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    );
  } else if (data) {
    body = (
      <div>
        <p className="text-[15px] leading-relaxed text-charcoal">
          {data.understanding}
        </p>
        {data.subtitle ? (
          <p className="mt-2 text-xs text-charcoal-light">{data.subtitle}</p>
        ) : null}
      </div>
    );
  } else {
    body = null;
  }

  return (
    <section
      className="rounded-xl border border-charcoal/10 bg-[#f0efe8] p-5 shadow-sm"
      aria-live="polite"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
        What Rex thinks this is
      </p>
      <div className="mt-3">{body}</div>
    </section>
  );
}

export { MAX_FILE_CHARS };
