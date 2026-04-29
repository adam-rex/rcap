"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const queryError = searchParams.get("error");
  const banner =
    queryError === "auth"
      ? "Could not complete sign-in. Try again or contact your admin."
      : null;

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-charcoal/[0.12] bg-cream-light/80 p-6 shadow-sm backdrop-blur-sm"
    >
      <div>
        <h1 className="font-serif text-xl tracking-tight text-charcoal">
          Sign in to Rex
        </h1>
        <p className="mt-1 text-sm text-charcoal-light/85">
          Use the account provisioned in Supabase.
        </p>
      </div>
      {banner ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-charcoal">
          {banner}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-charcoal">
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-charcoal-light">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-charcoal outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-charcoal-light">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-charcoal outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-lg bg-charcoal px-4 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-charcoal/90 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
