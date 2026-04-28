/** Shown while the home server component resolves data (and on segment navigations). */
export default function RootLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-cream px-6 text-charcoal"
      style={{ backgroundColor: "#f5f5f0", color: "#111111", minHeight: "100vh" }}
    >
      <p className="font-serif text-lg tracking-tight">Loading Rex…</p>
      <p className="mt-2 text-center text-xs text-charcoal-light/80">
        If this never finishes, open the site in Safari or Chrome — the editor
        preview sometimes blocks scripts.
      </p>
    </div>
  );
}
