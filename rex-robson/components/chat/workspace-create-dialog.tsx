"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const WORKSPACE_FORM_INPUT_CLASS =
  "w-full rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-light/50 outline-none ring-charcoal/20 focus:border-charcoal/25 focus:ring-2";

export const WORKSPACE_FORM_BTN_PRIMARY =
  "rounded-lg bg-charcoal px-3 py-2 text-xs font-medium text-cream transition-colors enabled:hover:bg-charcoal/90 disabled:cursor-not-allowed disabled:opacity-40";

export const WORKSPACE_FORM_BTN_SECONDARY =
  "rounded-lg border border-charcoal/15 bg-cream px-3 py-2 text-xs font-medium text-charcoal transition-colors enabled:hover:bg-charcoal/5 disabled:opacity-40";

export const WORKSPACE_FORM_LABEL_CLASS =
  "mb-1 block text-xs font-medium text-charcoal-light";

/** Full-width row control: opens edit dialog on click (quiet, not a separate CTA). */
export const WORKSPACE_BROWSE_ROW_BUTTON_CLASS =
  "flex w-full items-start gap-2 px-4 py-4 text-left transition-colors hover:bg-charcoal/5 focus-visible:bg-charcoal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal/20 focus-visible:ring-inset sm:gap-3";

type WorkspaceCreateDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function WorkspaceCreateDialog({
  open,
  title,
  onClose,
  children,
}: WorkspaceCreateDialogProps) {
  // Mount-detect so we only call createPortal client-side (avoids SSR mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Client-only portal mount; avoids SSR/hydration mismatch for createPortal target.
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Portaling to document.body decouples the overlay from any draggable/clickable
  // ancestor in the React tree (e.g. match-canvas cards), so dragstart on a button
  // inside the dialog can't bubble into the card and trigger a stage move.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 pt-[env(safe-area-inset-top,0px)] sm:items-center sm:p-4"
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-create-title"
        className="relative mt-auto max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] w-full max-w-md overflow-y-auto rounded-t-xl border border-charcoal/15 bg-cream pb-[env(safe-area-inset-bottom,0px)] shadow-xl sm:mt-0 sm:max-h-[90dvh] sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-charcoal/10 px-4 py-3">
          <h3
            id="workspace-create-title"
            className="font-serif text-lg tracking-tight text-charcoal"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-charcoal-light hover:bg-charcoal/5"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
