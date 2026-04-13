type Message = {
  id: string;
  role: "user" | "rex";
  text: string;
};

const demoMessages: Message[] = [
  {
    id: "1",
    role: "rex",
    text: "Hi — I’m Rex. Ask me anything about your pipeline, contacts, or deals.",
  },
  {
    id: "2",
    role: "user",
    text: "Summarise open deals for this quarter.",
  },
  {
    id: "3",
    role: "rex",
    text: "I’ll pull your active opportunities and group them by stage. Want me to include probability-weighted value?",
  },
];

export function ChatMessageList({ messages = demoMessages }: { messages?: Message[] }) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-8">
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
              {m.text}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
