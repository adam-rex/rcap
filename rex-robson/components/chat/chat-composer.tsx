"use client";

import { Mic, SendHorizontal } from "lucide-react";
import { useState } from "react";

export function ChatComposer() {
  const [value, setValue] = useState("");

  return (
    <div className="border-t border-charcoal/[0.08] bg-cream-light/90 px-3 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-charcoal/[0.08] bg-cream px-2 py-1.5 shadow-sm">
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-charcoal-light transition-colors hover:bg-charcoal/[0.06] hover:text-charcoal"
          aria-label="Voice input"
        >
          <Mic className="size-5" strokeWidth={1.75} />
        </button>
        <label htmlFor="rex-chat-input" className="sr-only">
          Message Rex
        </label>
        <input
          id="rex-chat-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Message Rex…"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-charcoal placeholder:text-charcoal/40 outline-none"
        />
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-charcoal text-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Send message"
          disabled={!value.trim()}
        >
          <SendHorizontal className="size-5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
