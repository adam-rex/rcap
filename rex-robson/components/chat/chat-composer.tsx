"use client";

import { Mic, Paperclip, SendHorizontal, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";

const ATTACHMENT_ACCEPT = ".pdf,application/pdf";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per file

type ChatComposerProps = {
  onSubmitSearch: (query: string, files: File[]) => void | Promise<void>;
  isBusy?: boolean;
  placeholder?: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatComposer({
  onSubmitSearch,
  isBusy = false,
  placeholder = "Search contacts, matches, orgs…",
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    const rejected: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const f = list.item(i);
      if (!f) continue;
      const isPdf =
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        rejected.push(`${f.name} (not a PDF)`);
        continue;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        rejected.push(`${f.name} (over ${formatBytes(MAX_ATTACHMENT_BYTES)})`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of next) {
        const key = `${f.name}:${f.size}`;
        if (!existingKeys.has(key)) {
          merged.push(f);
          existingKeys.add(key);
        }
      }
      return merged;
    });
    setAttachmentError(rejected.length > 0 ? `Skipped: ${rejected.join(", ")}` : null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if ((!q && files.length === 0) || isBusy) return;
    const toSend = files;
    setValue("");
    setFiles([]);
    setAttachmentError(null);
    await onSubmitSearch(q, toSend);
  }

  const canSubmit = !isBusy && (value.trim().length > 0 || files.length > 0);

  return (
    <div className="border-t border-charcoal/[0.08] bg-cream-light/90 px-3 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto max-w-3xl">
        {files.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}:${f.size}:${i}`}
                className="inline-flex items-center gap-2 rounded-full border border-charcoal/[0.12] bg-cream px-2.5 py-1 text-xs text-charcoal"
              >
                <Paperclip
                  className="size-3.5 shrink-0 text-charcoal-light"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="max-w-[16rem] truncate">{f.name}</span>
                <span className="text-charcoal-light/80">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={isBusy}
                  className="-mr-1 flex size-5 items-center justify-center rounded-full text-charcoal-light transition-colors hover:bg-charcoal/10 hover:text-charcoal disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border border-charcoal/[0.08] bg-cream px-2 py-1.5 shadow-sm"
        >
          <label
            htmlFor={fileInputId}
            className={
              "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-charcoal-light transition-colors hover:bg-charcoal/[0.06] hover:text-charcoal " +
              (isBusy ? "pointer-events-none opacity-50" : "")
            }
            aria-label="Attach PDF"
            title="Attach PDF"
          >
            <Paperclip className="size-5" strokeWidth={1.75} />
          </label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            disabled={isBusy}
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-charcoal-light transition-colors hover:bg-charcoal/[0.06] hover:text-charcoal"
            aria-label="Voice input"
          >
            <Mic className="size-5" strokeWidth={1.75} />
          </button>
          <label htmlFor="rex-chat-input" className="sr-only">
            Search workspace
          </label>
          <input
            id="rex-chat-input"
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={isBusy}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-charcoal placeholder:text-charcoal/40 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-charcoal text-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label={isBusy ? "Searching…" : "Run search"}
            disabled={!canSubmit}
          >
            <SendHorizontal className="size-5" strokeWidth={1.75} />
          </button>
        </form>
        {attachmentError ? (
          <p className="mt-2 px-1 text-xs text-amber-700" role="status">
            {attachmentError}
          </p>
        ) : null}
        {isBusy ? (
          <p className="mt-2 px-1 text-xs text-charcoal-light/80">
            Running workspace search…
          </p>
        ) : null}
      </div>
    </div>
  );
}
