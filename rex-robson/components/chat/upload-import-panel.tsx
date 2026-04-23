"use client";

import { FileText, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { CsvImportWizard, MAX_FILE_CHARS } from "./csv-import-wizard";
import { WORKSPACE_FORM_BTN_SECONDARY } from "./workspace-create-dialog";

const ACCEPT =
  ".pdf,.doc,.docx,.csv,.txt,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const STORAGE_KEY = "rex-upload-import-recent";

type BadgeVariant = "sky" | "emerald" | "amber";

type ProcessedImport = {
  id: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: number;
  status: "processing" | "processed";
  itemCount?: number;
  badges?: { label: string; variant: BadgeVariant }[];
};

function readRecentFromStorage(): ProcessedImport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProcessedImport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Placeholder extraction labels until the import API runs a real model pass. */
function inferDemoBadges(name: string): { itemCount: number; badges: ProcessedImport["badges"] } {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";

  if (ext === ".csv" || lower.includes("contact")) {
    return {
      itemCount: 4,
      badges: [
        { label: "3 contacts", variant: "sky" },
        { label: "1 organisation profile", variant: "emerald" },
      ],
    };
  }
  if (ext === ".txt" || lower.includes("note") || lower.includes("meeting")) {
    return {
      itemCount: 2,
      badges: [
        { label: "1 meeting summary", variant: "sky" },
        { label: "Follow-ups flagged", variant: "amber" },
      ],
    };
  }
  if (ext === ".pdf" || lower.includes("lender") || lower.includes("criteria")) {
    return {
      itemCount: 3,
      badges: [
        { label: "2 contacts", variant: "sky" },
        { label: "1 organisation profile", variant: "emerald" },
        { label: "Matching criteria updated", variant: "sky" },
      ],
    };
  }
  return {
    itemCount: 2,
    badges: [
      { label: "Extracted items", variant: "sky" },
      { label: "Review suggested", variant: "amber" },
    ],
  };
}

const badgeClass: Record<BadgeVariant, string> = {
  sky: "bg-sky-100 text-sky-900",
  emerald: "bg-emerald-100 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
};

type UploadImportPanelProps = {
  onGoToSuggestions?: () => void;
};

type CsvSession = { id: string; filename: string; csvText: string };

export function UploadImportPanel({ onGoToSuggestions }: UploadImportPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recent, setRecent] = useState<ProcessedImport[]>([]);
  const [confirmHint, setConfirmHint] = useState<string | null>(null);
  const [csvSession, setCsvSession] = useState<CsvSession | null>(null);

  useEffect(() => {
    const next = readRecentFromStorage();
    if (next.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate sessionStorage after mount (avoids SSR/client HTML mismatch)
    setRecent(next);
  }, []);

  const runDemoPipeline = useCallback((file: File) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `imp-${Date.now()}-${Math.random()}`;
    const base: ProcessedImport = {
      id,
      filename: file.name,
      sizeBytes: file.size,
      uploadedAt: Date.now(),
      status: "processing",
    };
    setRecent((prev) => {
      const next = [base, ...prev].slice(0, 20);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

    window.setTimeout(() => {
      const { itemCount, badges } = inferDemoBadges(file.name);
      setRecent((prev) => {
        const next = prev.map((row) =>
          row.id === id
            ? { ...row, status: "processed" as const, itemCount, badges }
            : row,
        );
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }, 900);
  }, []);

  const readCsvAndOpenWizard = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text =
        typeof reader.result === "string" ? reader.result : "";
      setCsvSession({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `csv-${Date.now()}`,
        filename: file.name,
        csvText: text.slice(0, MAX_FILE_CHARS),
      });
    };
    reader.onerror = () => {
      setConfirmHint("Couldn’t read that CSV — try again or check the file.");
    };
    reader.readAsText(file);
  }, []);

  const onFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      setConfirmHint(null);
      for (let i = 0; i < list.length; i += 1) {
        const file = list.item(i);
        if (!file) continue;
        const lower = file.name.toLowerCase();
        const isCsv =
          lower.endsWith(".csv") ||
          file.type === "text/csv" ||
          file.type === "application/vnd.ms-excel";
        if (isCsv) {
          readCsvAndOpenWizard(file);
          break;
        }
        runDemoPipeline(file);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [runDemoPipeline, readCsvAndOpenWizard],
  );

  const appendCsvToRecent = useCallback(
    (filename: string, rowHint: number) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `imp-${Date.now()}-${Math.random()}`;
      const entry: ProcessedImport = {
        id,
        filename,
        sizeBytes: 0,
        uploadedAt: Date.now(),
        status: "processed",
        itemCount: Math.max(1, rowHint),
        badges: [
          { label: "CSV mapped & reviewed", variant: "sky" },
          { label: "Ready for suggestions", variant: "emerald" },
        ],
      };
      setRecent((prev) => {
        const next = [entry, ...prev].slice(0, 20);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );

  if (csvSession) {
    return (
      <CsvImportWizard
        key={csvSession.id}
        filename={csvSession.filename}
        csvText={csvSession.csvText}
        onClose={() => setCsvSession(null)}
        onGoToSuggestions={onGoToSuggestions}
        onImportFinished={({ filename, dataRowCount }) => {
          appendCsvToRecent(filename, dataRowCount);
          setCsvSession(null);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-lg rounded-[var(--radius-card)] border border-charcoal/10 bg-cream-light p-6 shadow-sm sm:p-8">
        <header className="border-b border-charcoal/10 pb-5">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-charcoal">
            Upload & import
          </h2>
          <p className="mt-1.5 text-[15px] text-charcoal-light">
            Rex will read it and extract what matters
          </p>
        </header>

        <div className="pt-6">
          <label
            htmlFor={inputId}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={
              "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors " +
              (dragActive
                ? "border-charcoal/35 bg-charcoal/[0.04]"
                : "border-charcoal/20 bg-cream/80 hover:border-charcoal/30")
            }
          >
            <Upload
              className="size-10 text-charcoal-light/70"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="mt-4 text-sm font-semibold text-charcoal">
              Drop files here or tap to browse
            </span>
            <span className="mt-1.5 text-xs text-charcoal-light">
              Rex reads it. You confirm. Done.
            </span>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(["PDF", "DOCX", "CSV", "TXT"] as const).map((fmt) => (
                <span
                  key={fmt}
                  className="rounded-md border border-charcoal/15 bg-cream-light px-2.5 py-1 text-[11px] font-medium text-charcoal-light"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </label>
        </div>

        <section className="mt-8">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
            Recently processed
          </h3>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-charcoal-light">
              No files yet — drop something above to see how Rex will package it
              for review.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {recent.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-charcoal/10 bg-[#f0efe8] p-4 sm:p-5"
                >
                  <div className="flex gap-3">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-400"
                      aria-hidden
                    >
                      <FileText className="size-5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-charcoal">
                        {row.filename}
                      </p>
                      <p className="mt-0.5 text-xs text-charcoal-light">
                        {formatBytes(row.sizeBytes)} · Uploaded {timeAgo(row.uploadedAt)}
                      </p>
                      {row.status === "processing" ? (
                        <p className="mt-3 text-xs text-charcoal-light">
                          <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-500 align-middle" />{" "}
                          Processing…
                        </p>
                      ) : (
                        <>
                          <p className="mt-3 flex items-center gap-2 text-xs text-charcoal">
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                              aria-hidden
                            />
                            Processed — Rex found {row.itemCount ?? 0} item
                            {(row.itemCount ?? 0) === 1 ? "" : "s"}.
                          </p>
                          {row.badges && row.badges.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {row.badges.map((b) => (
                                <span
                                  key={b.label}
                                  className={
                                    "rounded-md px-2.5 py-1 text-[11px] font-medium " +
                                    badgeClass[b.variant]
                                  }
                                >
                                  {b.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={WORKSPACE_FORM_BTN_SECONDARY}
                              onClick={() => onGoToSuggestions?.()}
                            >
                              Review items
                            </button>
                            <button
                              type="button"
                              className={WORKSPACE_FORM_BTN_SECONDARY}
                              onClick={() =>
                                setConfirmHint(
                                  "Saving imported rows to the workspace will use the import API once it’s wired — for now, use Suggestions after review.",
                                )
                              }
                            >
                              Confirm all & save
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {confirmHint ? (
          <p
            className="mt-4 text-xs text-charcoal-light"
            role="status"
            aria-live="polite"
          >
            {confirmHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
