"use client";

import { useParams } from "next/navigation";
import { PipelineDealDetailRoute } from "@/components/chat/pipeline-deal-detail-route";

export default function PipelineDealPage() {
  const params = useParams();
  const id = params.id;
  if (typeof id !== "string" || id.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <p className="text-sm text-charcoal-light">Invalid deal.</p>
      </div>
    );
  }
  return <PipelineDealDetailRoute dealId={id} />;
}
