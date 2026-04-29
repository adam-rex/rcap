import { MapPin } from "lucide-react";

type ContactPairGeographyProps = {
  contactAName: string;
  contactBName: string;
  contactAGeography: string | null;
  contactBGeography: string | null;
};

function firstToken(name: string): string {
  const t = name.trim().split(/\s+/)[0];
  return t || name;
}

const geoChipClass =
  "inline-flex max-w-full items-center rounded-full border border-charcoal/12 bg-charcoal/[0.06] px-2 py-0.5 text-[11px] font-medium text-charcoal";

/** When either contact has CRM geography — shown on Suggestions / Opportunities (hidden if both empty). */
export function ContactPairGeographyLine({
  contactAName,
  contactBName,
  contactAGeography,
  contactBGeography,
}: ContactPairGeographyProps) {
  const a = contactAGeography?.trim() || null;
  const b = contactBGeography?.trim() || null;
  if (!a && !b) return null;

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5"
      title={`Geography — ${contactAName}: ${a ?? "not set"}; ${contactBName}: ${b ?? "not set"}`}
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-charcoal/80">
        <MapPin
          className="size-3.5 shrink-0 text-charcoal/55"
          strokeWidth={1.75}
          aria-hidden
        />
        Geography
      </span>
      {a ? (
        <span className={geoChipClass}>
          <span className="text-charcoal-light/90">{firstToken(contactAName)}</span>
          <span className="mx-0.5 text-charcoal-light/50">·</span>
          <span>{a}</span>
        </span>
      ) : null}
      {b ? (
        <span className={geoChipClass}>
          <span className="text-charcoal-light/90">{firstToken(contactBName)}</span>
          <span className="mx-0.5 text-charcoal-light/50">·</span>
          <span>{b}</span>
        </span>
      ) : null}
    </div>
  );
}
