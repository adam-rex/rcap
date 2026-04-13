"use client";

import { Mic, SendHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";

type ChatComposerProps = {
  onSubmitSearch: (query: string) => void | Promise<void>;
  isBusy?: boolean;
  placeholder?: string;
};

export function ChatComposer({
  onSubmitSearch,
  isBusy = false,
  placeholder = "Search contacts, deals, orgs…",
}: ChatComposerProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || isBusy) return;
    setValue("");
    await onSubmitSearch(q);
  }

  return (
    <div className="border-t border-charcoal/[0.08] bg-cream-light/90 px-3 py-3 backdrop-blur-sm sm:px-6">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-charcoal/[0.08] bg-cream px-2 py-1.5 shadow-sm"
      >
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
          disabled={!value.trim() || isBusy}
        >
          <SendHorizontal className="size-5" strokeWidth={1.75} />
        </button>
      </form>
      {isBusy ? (
        <p className="mx-auto mt-2 max-w-3xl px-1 text-xs text-charcoal-light/80">
          Running workspace search…
        </p>
      ) : null}
    </div>
  );
}
