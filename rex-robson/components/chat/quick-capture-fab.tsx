"use client";

import { Plus } from "lucide-react";

type QuickCaptureFabProps = {
  onClick: () => void;
  hidden?: boolean;
};

/**
 * Floating action for Quick Capture on large screens. On viewports with the
 * bottom tab bar, Quick Capture is offered from the app header so this button
 * does not cover the Ask Rex composer (send) or other bottom actions. Hidden
 * while the dialog is open so the backdrop remains unobstructed.
 */
export function QuickCaptureFab({ onClick, hidden = false }: QuickCaptureFabProps) {
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-charcoal px-4 py-3 text-sm font-semibold text-cream shadow-lg shadow-charcoal/20 transition-all hover:bg-charcoal/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/25 sm:px-5 sm:py-3.5 lg:flex"
      aria-label="Quick Capture — add a contact"
    >
      <Plus className="size-5" strokeWidth={2.25} aria-hidden />
      <span className="hidden sm:inline">Quick Capture</span>
    </button>
  );
}
