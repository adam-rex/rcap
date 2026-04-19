import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatMessage = {
  id: string;
  role: "user" | "rex";
  text: string;
};

type ChatMessageListProps = {
  messages: ChatMessage[];
};

const rexMarkdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-1 leading-relaxed" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-1 list-disc space-y-1 pl-5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-1 list-decimal space-y-1 pl-5" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold" {...props} />
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
} as const;

export function ChatMessageList({ messages }: ChatMessageListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-8">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="flex justify-end">
            <div
              className="max-w-[min(85%,28rem)] rounded-2xl rounded-br-md bg-charcoal px-4 py-2.5 text-[15px] leading-relaxed text-cream"
              role="article"
              aria-label="You"
            >
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex justify-start">
            <div
              className="max-w-[min(85%,28rem)] rounded-2xl rounded-bl-md bg-muted/90 px-4 py-2.5 text-[15px] leading-relaxed text-charcoal"
              role="article"
              aria-label="Rex"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={rexMarkdownComponents}
              >
                {m.text}
              </ReactMarkdown>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
