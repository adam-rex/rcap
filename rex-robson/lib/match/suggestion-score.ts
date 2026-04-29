/**
 * Intro suggestion **match fit** (shown as X/5 in the app) is derived from a
 * heuristic `scorePair()` in `lib/data/intro-match-suggestions.ts`:
 *
 * - **Sector overlap** (+7, +1 extra when two or more tags overlap): enough on
 *   its own to surface a suggestion; maps to at least tier 2 in the UI.
 * - **Deal type overlap** (up to 4): shared deal-type tags; empty on either
 *   side is neutral (compatible), not a mismatch.
 * - **Cheque / deal size** (+3): min/max ranges intersect only when **both**
 *   contacts have at least one bound; otherwise no points (unknown / compatible).
 * - **Geography** (+2): shared geography tokens when both sides have tokens.
 * - **Warm relationship** (+1): either side has `relationship_score` ≥ 7.
 * - **Stale on both sides** (−1): both last contacted more than 365 days ago
 *   (sector overlap is floored to `MIN_SCORE` so a sector match is not dropped).
 *
 * Pairs must reach `MIN_SCORE` (currently 7) before they become suggestions.
 * The raw integer is then **bucketed** into five tiers so the UI stays readable.
 *
 * Thresholds are chosen so tier 2 is typically sector-led; tiers 3–5 add
 * overlapping deal type, geography, and/or cheque fit (typical raw ≈ 7–14+).
 */

export type MatchFitTier = 1 | 2 | 3 | 4 | 5;

export type SuggestionTierDefinition = {
  tier: MatchFitTier;
  /** Short label for badges and compact UI */
  label: string;
  /** One-line summary */
  summary: string;
  /** Tooltip / detail — what this tier implies for real intros */
  detail: string;
};

/** Ordered 1 → 5 for rendering help copy and filters */
export const SUGGESTION_MATCH_FIT_TIERS: readonly SuggestionTierDefinition[] = [
  {
    tier: 1,
    label: "Thin overlap",
    summary: "Borderline — passes the minimum bar only",
    detail:
      "Typically one or two modest signals (for example a single sector or deal-type tag plus something small, cheque fit without rich context, or overlaps that barely clear the generator threshold). Worth scanning, not a high-confidence intro on data alone.",
  },
  {
    tier: 2,
    label: "Early signal",
    summary: "Some alignment — not enough to call it a strong match yet",
    detail:
      "Often overlap on category (sector and/or deal type) but missing a second pillar, OR economics (cheque/geography) aligns without both thematic tags lining up. Reasonable to explore if you know more context than Rex stores.",
  },
  {
    tier: 3,
    label: "Solid fit",
    summary: "Several independent signals agree",
    detail:
      "Usually multiple dimensions line up — for example sector plus deal type, or sector plus cheque and/or geography. You have a defensible reason to connect these people from structured fields alone.",
  },
  {
    tier: 4,
    label: "Strong fit",
    summary: "Broad alignment — strategy and economics largely agree",
    detail:
      "Normally sector and deal type both hit, plus cheque sizing or geography (often several of these). This is the range where automated matching looks compelling before you add personal judgment.",
  },
  {
    tier: 5,
    label: "Excellent fit",
    summary: "Exceptional overlap across profile fields",
    detail:
      "Near-maximum signal: sector, deal type, cheque range, and geography tend to align together, with warmth possible and without both sides being long-uncontacted. Treat as highest priority when triaging suggestions.",
  },
] as const;

const THRESHOLD_T5 = 13;
const THRESHOLD_T4 = 11;
const THRESHOLD_T3 = 9;
const THRESHOLD_T2 = 7;

/**
 * Maps a raw heuristic score from `scorePair()` to a 1–5 match-fit tier.
 * Same thresholds as the historical UI buckets.
 */
export function matchFitOutOfFive(raw: number): MatchFitTier {
  if (!Number.isFinite(raw)) return 1;
  if (raw >= THRESHOLD_T5) return 5;
  if (raw >= THRESHOLD_T4) return 4;
  if (raw >= THRESHOLD_T3) return 3;
  if (raw >= THRESHOLD_T2) return 2;
  return 1;
}

export function suggestionTierDefinition(tier: MatchFitTier): SuggestionTierDefinition {
  return SUGGESTION_MATCH_FIT_TIERS[tier - 1]!;
}

export function suggestionTierMetaForRaw(raw: number): SuggestionTierDefinition {
  return suggestionTierDefinition(matchFitOutOfFive(raw));
}
