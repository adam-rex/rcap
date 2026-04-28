"use client";

import { useParams } from "next/navigation";
import { ContactDetailRoute } from "@/components/chat/contact-detail-route";

export default function ContactPage() {
  const params = useParams();
  const id = params.id;
  if (typeof id !== "string" || id.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <p className="text-sm text-charcoal-light">Invalid contact.</p>
      </div>
    );
  }
  return <ContactDetailRoute contactId={id} />;
}
