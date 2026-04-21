"use client";

import { Plus } from "lucide-react";

type QuickCaptureFabProps = {
  onClick: () => void;
  hidden?: boolean;
};

/**
 * Global floating action button for Quick Capture. Pinned bottom-right on every
 * nav tab, above the composer bar. Hidden while the dialog itself is open so
 * the backdrop click-target is unobstructed.
 */
export function QuickCaptureFab({ onClick, hidden = false }: QuickCaptureFabProps) {
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-charcoal px-5 py-3.5 text-sm font-semibold text-cream shadow-lg shadow-charcoal/20 transition-all hover:bg-charcoal/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/25 sm:bottom-6 sm:right-6"
      aria-label="Quick Capture — add a contact"
    >
      <Plus className="size-5" strokeWidth={2.25} aria-hidden />
      <span className="hidden sm:inline">Quick Capture</span>
    </button>
  );
}
