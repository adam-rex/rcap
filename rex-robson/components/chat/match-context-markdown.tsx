"use client";

import { FileText, Target, Thermometer } from "lucide-react";
import type React from "react";
import type { ReactNode } from "react";
import { isValidElement } from "react";
import type { Components, ExtraProps } from "react-markdown";

function flattenTextNodes(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenTextNodes).join("");
  if (isValidElement(node)) {
    const ch = (node.props as { children?: ReactNode }).children;
    return flattenTextNodes(ch);
  }
  return "";
}

function whyFitSectionIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("warmth")) return Thermometer;
  if (lower.includes("why") || lower.includes("match")) return Target;
  return FileText;
}

/**
 * Per-render factory so paragraph index resets for each row (opportunity or suggestion).
 */
export function createWhyFitMarkdownComponents(): Components {
  let pIndex = 0;

  return {
    h2: (props: React.ComponentPropsWithoutRef<"h2"> & ExtraProps) => {
      const { children, className, ...rest } = props;
      const text = flattenTextNodes(children).trim() || "Section";
      const Icon = whyFitSectionIcon(text);
      return (
        <div
          className={`not-prose mt-4 flex items-center gap-2 border-b border-charcoal/[0.08] pb-1.5 first:mt-0${
            className ? ` ${className}` : ""
          }`}
        >
          <Icon
            className="size-3.5 shrink-0 text-charcoal/45"
            strokeWidth={1.75}
            aria-hidden
          />
          <h2
            className="text-[10px] font-semibold uppercase tracking-wider text-charcoal/75"
            {...rest}
          >
            {children}
          </h2>
        </div>
      );
    },
    h3: (props: React.ComponentPropsWithoutRef<"h3"> & ExtraProps) => {
      const { children, className, ...rest } = props;
      return (
        <h3
          className={`mt-3 text-xs font-semibold text-charcoal ${className ?? ""}`}
          {...rest}
        >
          {children}
        </h3>
      );
    },
    p: (props: React.ComponentPropsWithoutRef<"p"> & ExtraProps) => {
      const { children, className, ...rest } = props;
      const i = pIndex++;
      const raw = flattenTextNodes(children).trim();
      if (/^why this match$/i.test(raw) || /^warmth$/i.test(raw)) {
        const Icon = whyFitSectionIcon(raw);
        return (
          <div className="not-prose mt-4 flex items-center gap-2 border-b border-charcoal/[0.08] pb-1.5 first:mt-0">
            <Icon
              className="size-3.5 shrink-0 text-charcoal/45"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-charcoal/75">
              {raw}
            </h2>
          </div>
        );
      }
      if (i === 0 && raw.includes("<>")) {
        return (
          <p
            className={`rounded-md border border-charcoal/[0.10] bg-cream-light/50 px-2.5 py-2 text-sm font-medium leading-relaxed text-charcoal ${
              className ?? ""
            }`}
            {...rest}
          >
            {children}
          </p>
        );
      }
      return (
        <p className={`my-1.5 leading-relaxed ${className ?? ""}`} {...rest}>
          {children}
        </p>
      );
    },
    ul: (props: React.ComponentPropsWithoutRef<"ul"> & ExtraProps) => {
      const { children, className, ...rest } = props;
      return (
        <ul
          className={`my-2 list-none space-y-2 pl-0 sm:grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2 sm:space-y-0 ${
            className ?? ""
          }`}
          {...rest}
        >
          {children}
        </ul>
      );
    },
    ol: (props: React.ComponentPropsWithoutRef<"ol"> & ExtraProps) => (
      <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />
    ),
    li: (props: React.ComponentPropsWithoutRef<"li"> & ExtraProps) => {
      const { children, className, ...rest } = props;
      const raw = flattenTextNodes(children).trim();
      const m = raw.match(/^([^:]+):\s*([\s\S]+)$/);
      if (m) {
        const label = m[1].trim();
        const value = m[2].trim();
        return (
          <li className={`list-none min-w-0 ${className ?? ""}`} {...rest}>
            <div className="rounded-md border border-charcoal/[0.08] bg-cream-light/50 px-2.5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-light/90">
                {label}
              </span>
              <p className="mt-0.5 text-[13px] leading-snug text-charcoal">
                {value}
              </p>
            </div>
          </li>
        );
      }
      return (
        <li
          className={`list-none text-[13px] leading-relaxed ${className ?? ""}`}
          {...rest}
        >
          {children}
        </li>
      );
    },
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong className="font-semibold text-charcoal" {...props} />
    ),
    code: (props: React.HTMLAttributes<HTMLElement>) => (
      <code
        className="rounded bg-charcoal/[0.06] px-1 py-0.5 font-mono text-[0.92em]"
        {...props}
      />
    ),
    pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
      <pre
        className="my-2 overflow-x-auto rounded-lg bg-charcoal/[0.06] p-2 font-mono text-[0.92em]"
        {...props}
      />
    ),
  };
}
