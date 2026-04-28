"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-6 text-charcoal">
      <p className="text-center text-sm">
        {process.env.NODE_ENV === "development"
          ? error?.message ?? "Something went wrong."
          : "Something went wrong."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-charcoal/15 bg-charcoal px-4 py-2 text-xs font-medium text-cream"
      >
        Try again
      </button>
    </div>
  );
}
