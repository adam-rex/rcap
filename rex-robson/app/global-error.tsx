"use client";

/**
 * Root error UI when the root layout cannot render. Must include <html> and <body>
 * and cannot rely on Tailwind from the root layout (layout is replaced).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg =
    process.env.NODE_ENV === "development"
      ? (error?.message ?? "Something went wrong.")
      : "Something went wrong.";
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f5f5f0",
          color: "#111111",
          fontFamily:
            'system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{msg}</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(17,17,17,0.2)",
              background: "#111111",
              color: "#f5f5f0",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
