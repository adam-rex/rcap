import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex max-w-lg flex-col items-center gap-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-card bg-charcoal text-cream">
          <Sparkles className="h-8 w-8" aria-hidden />
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl tracking-tight text-charcoal sm:text-5xl">
            REX
          </h1>
          <p className="text-lg text-charcoal-light">
            Add this app to your home screen for a full-screen experience. Built
            with Next.js, Tailwind CSS v4, and Lucide icons.
          </p>
        </div>
        <p className="rounded-pill border border-charcoal/10 bg-cream-light px-4 py-2 text-sm text-charcoal-light">
          On iPhone: Share → Add to Home Screen
        </p>
      </div>
    </div>
  );
}
