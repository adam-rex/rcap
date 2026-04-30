#!/usr/bin/env python3
"""
Re-classify Supabase contacts with Claude Sonnet (rich advisory vs investor prompts).

Requires: pip install -r scripts/import-linkedin-requirements.txt

Env (repo root .env.local): SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.

Usage:
  python scripts/reclassify-contacts.py                    # sample 50 → CSV, no DB writes
  python scripts/reclassify-contacts.py --sample 50        # same
  python scripts/reclassify-contacts.py --sample 100
  python scripts/reclassify-contacts.py --full             # all contacts → batch updates
  python scripts/reclassify-contacts.py --full --only-uncertain
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
LOG_PATH = ROOT / "scripts" / "reclassify.log"
CSV_PATH = ROOT / "scripts" / "reclassify-test.csv"
INTER_CALL_DELAY_S = 0.2
UPDATE_BATCH = 50
PAGE_SIZE_FETCH = 1000

VALID_CONTACT_TYPES = (
    "Founder",
    "Investor",
    "Lender",
    "Advisor",
    "Corporate",
    "Other",
)

VALID_SECTORS = frozenset(
    {
        "fintech",
        "wealth_asset_management",
        "insurance_insurtech",
        "crypto_web3",
        "capital_markets",
        "saas_b2b",
        "consumer_tech",
        "enterprise_software",
        "cybersecurity",
        "ai_ml",
        "developer_tools",
        "data_analytics",
        "healthcare_services",
        "biotech_pharma",
        "medtech_devices",
        "digital_health",
        "consumer_brands",
        "ecommerce_marketplaces",
        "retail",
        "media_entertainment",
        "hospitality_travel",
        "real_estate_proptech",
        "construction_built_environment",
        "industrials_manufacturing",
        "logistics_supply_chain",
        "energy_climate",
        "agriculture_food",
        "professional_services",
        "education_edtech",
        "government_public_sector",
        "nonprofit_social_impact",
        "other",
    }
)

CONFIDENCE_LEVELS = frozenset({"high", "medium", "low"})
CLASSIFICATION_MODEL = "claude-sonnet-4-6"

# Verbatim classification instructions (substitution appended below for Name / Company / Position).
_CLASSIFY_PROMPT_PREFIX = """You are classifying a professional contact for a relationship intelligence CRM that matches founders with investors. You must determine TWO things: their professional role type, and the sector they operate in.

ROLE TYPE — pick exactly ONE:

Founder: Currently builds/runs an operating company. Position contains "Founder", "Co-founder", "Founding [executive role]" (CEO/CTO/COO/CFO/President), OR is C-suite at a clear startup. Does NOT include "Founding Engineer", "Founding Designer", "Founding Product Manager" (those are early employees, classify as Corporate). Does NOT include "Founding Partner" at law/accounting/consulting firms (those are Advisor).

Investor: Personally deploys capital into companies. Includes VC partners/principals/associates, angel investors, family office principals, fund managers, LPs with discretion, growth equity professionals, private equity investment professionals. Must have actual decision-making authority over deployment of capital.

Lender: Personally provides debt/credit to companies. Includes venture debt, private credit, asset finance specialists, lending desk bankers (NOT M&A bankers — those are Advisor).

Advisor: Provides professional services on transactions but does NOT deploy capital. INCLUDES:
- LAWYERS at any firm (M&A, fund formation, corporate, "Investment Funds Lawyer", "Private Equity Lawyer", "Securities Lawyer", general corporate, regulatory)
- INVESTMENT BANKERS providing M&A advisory, capital raising, ECM/DCM, sector coverage (Goldman, Morgan Stanley, JPM IBD, Rothschild, Lazard, Houlihan Lokey, Evercore, Moelis, Centerview, boutiques)
- ACCOUNTANTS at audit/tax/transaction services firms (Deloitte, PwC, EY, KPMG, BDO, Grant Thornton, RSM)
- MANAGEMENT CONSULTANTS (McKinsey, BCG, Bain, Oliver Wyman, OC&C, Roland Berger, LEK)
- INDEPENDENT ADVISORS, M&A boutiques, transaction advisory specialists, strategy advisors
- CORPORATE FINANCE professionals at advisory firms

Corporate: Standard employee at an operating company in a non-deal-making role. Includes operations, marketing, sales, engineering, HR, IR, comms, product, etc. Default for ambiguous office workers at non-financial firms.

Other: Students, retirees, journalists, sports figures, government officials (non-policy), volunteers, board roles at clubs, anyone clearly not in a business/finance role.

KEYWORD TRAPS — override surface keywords in favour of actual role:
- "Investment Lawyer" / "Investment Funds Lawyer" / "Private Equity Lawyer" / "Funds Lawyer" → ADVISOR
- "Investor Relations" / "Head of IR" / "VP IR" → CORPORATE (even at a VC firm)
- "Investment Banker" / "Investment Banking [any seniority]" / "M&A Banker" / "Coverage Banker" → ADVISOR
- "Founding Engineer" / "Founding Designer" / "Founding [non-executive]" → CORPORATE
- "Founding Partner" at a LAW/ACCOUNTING/CONSULTING firm → ADVISOR
- "Partner" disambiguation: VC/PE/family office firm → INVESTOR. Law/accounting/consulting firm → ADVISOR. Operating company → CORPORATE.
- "Managing Director" disambiguation: at a bank, usually ADVISOR (banking division). At a fund, usually INVESTOR. Use firm context.
- "Director" with no other context → OTHER with low confidence (genuinely too ambiguous)
- "Founder" / "Co-founder" as the primary role in a position string (e.g. "Founder", "Co-founder", "Founder & CEO", "Co-founder & CTO") → FOUNDER, regardless of firm name. Only override to a different type if there is strong evidence (e.g. "Founding Partner" at a law firm → ADVISOR, "Founding Engineer" → CORPORATE). Do NOT override "Founder & Managing Partner" of an unknown firm to Investor based on firm-name speculation; default to FOUNDER and mark medium confidence if uncertain.

SECTOR — pick ONE of (lowercase snake_case): fintech, wealth_asset_management, insurance_insurtech, crypto_web3, capital_markets, saas_b2b, consumer_tech, enterprise_software, cybersecurity, ai_ml, developer_tools, data_analytics, healthcare_services, biotech_pharma, medtech_devices, digital_health, consumer_brands, ecommerce_marketplaces, retail, media_entertainment, hospitality_travel, real_estate_proptech, construction_built_environment, industrials_manufacturing, logistics_supply_chain, energy_climate, agriculture_food, professional_services, education_edtech, government_public_sector, nonprofit_social_impact, other

For Founders/Corporates: pick the sector their company operates in.
For Investors/Lenders: pick the sector they primarily focus on (often clear from firm name; if generalist, pick the most prominent sector).
For Advisors at law/accounting/consulting firms: use professional_services.
Avoid "other" unless genuinely uncategorisable.

CONFIDENCE — for each field, return one of: high, medium, low.
- high: clear from title + firm
- medium: reasonable inference but some ambiguity
- low: genuinely uncertain; mark for review

Use confidence honestly. Better to mark low than to guess.

EXAMPLES:

Input: name="Annaliese McGeoch", company="Walkers", position="Investment Funds and Corporate Lawyer"
Output: {"contact_type": "Advisor", "contact_type_confidence": "high", "sector": "professional_services", "sector_confidence": "high", "reasoning": "Walkers is a Cayman law firm; 'Investment Funds Lawyer' is her practice area — she advises funds, doesn't invest."}

Input: name="Sarah Chen", company="Sequoia Capital", position="Investment Associate"
Output: {"contact_type": "Investor", "contact_type_confidence": "high", "sector": "saas_b2b", "sector_confidence": "low", "reasoning": "Investment Associate at a generalist VC firm; sector defaults to most prominent but uncertain without more context."}

Input: name="Marcus Webb", company="Octopus Ventures", position="Head of Investor Relations"
Output: {"contact_type": "Corporate", "contact_type_confidence": "high", "sector": "wealth_asset_management", "sector_confidence": "medium", "reasoning": "IR communicates with LPs, doesn't deploy capital, even at VC firm."}

Input: name="James Kim", company="Goldman Sachs", position="Vice President, M&A Healthcare"
Output: {"contact_type": "Advisor", "contact_type_confidence": "high", "sector": "healthcare_services", "sector_confidence": "high", "reasoning": "M&A banker at Goldman, healthcare coverage; advises on transactions, doesn't invest."}

Input: name="Priya Shah", company="Acme Robotics", position="Founding Engineer"
Output: {"contact_type": "Corporate", "contact_type_confidence": "high", "sector": "industrials_manufacturing", "sector_confidence": "medium", "reasoning": "Founding Engineer = early employee, not a founder. Sector inferred from company name."}

Input: name="David Lee", company="Linklaters", position="Founding Partner"
Output: {"contact_type": "Advisor", "contact_type_confidence": "high", "sector": "professional_services", "sector_confidence": "high", "reasoning": "Partner at law firm; 'Founding Partner' here means firm-founding partner, not company founder."}

Input: name="Aaron Wright", company="Independence CIC", position="Managing Director"
Output: {"contact_type": "Other", "contact_type_confidence": "low", "sector": "nonprofit_social_impact", "sector_confidence": "medium", "reasoning": "CIC = Community Interest Company; 'Managing Director' is generic. Mark for review."}

Input: name="Elena Garcia", company="Atomico", position="Partner"
Output: {"contact_type": "Investor", "contact_type_confidence": "high", "sector": "saas_b2b", "sector_confidence": "low", "reasoning": "Partner at VC firm = investor with deployment authority; sector uncertain at generalist firm."}

Now classify this person:

"""


_CLASSIFY_PROMPT_SUFFIX = """

Respond with EXACTLY one JSON object, no other text. Schema:
{"contact_type": "<Founder|Investor|Lender|Advisor|Corporate|Other>",
 "contact_type_confidence": "<high|medium|low>",
 "sector": "<sector_slug>",
 "sector_confidence": "<high|medium|low>",
 "reasoning": "<one sentence>"}
"""


def build_classification_prompt(*, name: str, company: str, position: str) -> str:
    safe_name = name or ""
    safe_company = company or ""
    safe_position = position or ""
    return (
        _CLASSIFY_PROMPT_PREFIX
        + f"Name: {safe_name}\nCompany: {safe_company}\nPosition: {safe_position}"
        + _CLASSIFY_PROMPT_SUFFIX
    )


class ClassifyResult(TypedDict):
    contact_type: str
    contact_type_confidence: str
    sector: str
    sector_confidence: str
    reasoning: str


def load_env() -> dict[str, str]:
    load_dotenv(ROOT / ".env.local")
    import os

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    anth = os.environ.get("ANTHROPIC_API_KEY") or ""
    missing: list[str] = []
    if not url:
        missing.append("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL")
    if not key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not anth.strip():
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        sys.exit(f"Missing env in .env.local: {', '.join(missing)}")
    return {"url": url.strip(), "service_key": key.strip(), "anthropic": anth.strip()}


def normalize_contact_type(raw: str | None) -> str | None:
    if not raw:
        return None
    t = raw.strip()
    for v in VALID_CONTACT_TYPES:
        if t.casefold() == v.casefold():
            return v
    return None


def normalize_sector_slug(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    s = re.sub(r"\s+", "_", s)
    s = s.replace("-", "_")
    return s if s in VALID_SECTORS else None


def normalize_confidence(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    return s if s in CONFIDENCE_LEVELS else None


def extract_json_object(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    try:
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```\s*$", "", text).strip()
    except Exception:
        pass
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    idx = text.find("{")
    if idx < 0:
        return None
    scan = ""
    depth = 0
    started = False
    for i, ch in enumerate(text[idx:], start=idx):
        if ch == "{":
            depth += 1
            started = True
        elif ch == "}":
            depth -= 1
        if started:
            scan += ch
        if started and depth == 0:
            try:
                return json.loads(scan)
            except json.JSONDecodeError:
                return None
    return None


def validate_model_output(parsed: dict[str, Any]) -> ClassifyResult | None:
    if not parsed:
        return None
    ct = normalize_contact_type(parsed.get("contact_type"))
    sec = normalize_sector_slug(parsed.get("sector"))
    ctc = normalize_confidence(parsed.get("contact_type_confidence"))
    sc = normalize_confidence(parsed.get("sector_confidence"))
    reason = parsed.get("reasoning")
    if ct is None or sec is None or ctc is None or sc is None:
        return None
    reason_s = "" if reason is None else str(reason).strip()
    if not reason_s:
        return None
    return ClassifyResult(
        contact_type=ct,
        contact_type_confidence=ctc,
        sector=sec,
        sector_confidence=sc,
        reasoning=reason_s,
    )


def call_anthropic(
    anthropic_client: Any,
    *,
    prompt: str,
    logf,
) -> str:
    raw = ""
    for attempt in range(6):
        try:
            time.sleep(INTER_CALL_DELAY_S)
            msg = anthropic_client.messages.create(
                model=CLASSIFICATION_MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text if msg.content else ""
            return raw
        except Exception as e:
            status = getattr(e, "status_code", None)
            err_s = str(e).lower()
            if status == 429 or "429" in err_s or "rate_limit" in err_s:
                wait = min(2.0 * (2**attempt), 60.0)
                print(f"  Rate limited; sleeping {wait:.1f}s …", file=sys.stderr)
                logf.write(f"# rate_limit_retry attempt={attempt + 1} sleep={wait}\n")
                logf.flush()
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("Claude API rate-limited; exhausted retries") from None


def classify_contact_once(
    anthropic_client: Any,
    *,
    name: str,
    company: str,
    position: str,
    logf,
) -> ClassifyResult | None:
    prompt = build_classification_prompt(name=name, company=company, position=position)
    raw1 = call_anthropic(anthropic_client, prompt=prompt, logf=logf)
    parsed = validate_model_output(extract_json_object(raw1) or {})

    if parsed is not None:
        return parsed

    logf.write(
        f"# invalid_output_retry name={name!r} company={company!r} position={position!r}\n"
    )
    logf.flush()

    raw2 = call_anthropic(anthropic_client, prompt=prompt, logf=logf)
    parsed = validate_model_output(extract_json_object(raw2) or {})
    if parsed is not None:
        return parsed

    logf.write(
        f"# skip_invalid_after_retries name={name!r} company={company!r} position={position!r}\n"
    )
    logf.flush()
    return None


def company_from_row(row: dict[str, Any]) -> str:
    org = row.get("organisation") or row.get("organisations") or {}
    if isinstance(org, dict):
        n = org.get("name")
        return (n or "").strip()
    return ""


def contacts_select_columns() -> str:
    # FK embed: aliased organisation name (matches app select pattern).
    return ",".join(
        [
            "id",
            "name",
            "role",
            "contact_type",
            "sector",
            "contact_type_confidence",
            "organisation:organisations(name)",
        ]
    )


def fetch_contacts_count(
    supabase: Any,
    *,
    only_uncertain: bool,
) -> int:
    q = supabase.table("contacts").select("*", count="exact").limit(1)
    if only_uncertain:
        q = q.or_("contact_type_confidence.is.null,contact_type_confidence.eq.low")
    res = q.execute()
    cnt = getattr(res, "count", None)
    if cnt is None:
        return 0
    return int(cnt)


def fetch_contacts_page(
    supabase: Any,
    *,
    start: int,
    end: int,
    only_uncertain: bool,
) -> list[dict[str, Any]]:
    q = (
        supabase.table("contacts")
        .select(contacts_select_columns())
        .order("id")
        .range(start, end)
    )
    if only_uncertain:
        q = q.or_("contact_type_confidence.is.null,contact_type_confidence.eq.low")
    res = q.execute()
    return list(res.data or [])


def iter_all_contact_rows(
    supabase: Any,
    *,
    only_uncertain: bool,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        chunk = fetch_contacts_page(
            supabase,
            start=offset,
            end=offset + PAGE_SIZE_FETCH - 1,
            only_uncertain=only_uncertain,
        )
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < PAGE_SIZE_FETCH:
            break
        offset += PAGE_SIZE_FETCH
    return out


def fetch_random_contact_sample(
    supabase: Any,
    *,
    sample_n: int,
) -> list[dict[str, Any]]:
    count = fetch_contacts_count(supabase, only_uncertain=False)
    if count <= 0:
        return []
    take_n = min(sample_n, count)
    picked_offsets: set[int] = set()
    rows_out: dict[str, dict[str, Any]] = {}
    safety = 0
    max_attempts = max(take_n * 20, 200)
    cols = contacts_select_columns()
    while len(rows_out) < take_n and safety < max_attempts:
        safety += 1
        off = random.randrange(0, count)
        if off in picked_offsets:
            continue
        picked_offsets.add(off)
        res = (
            supabase.table("contacts")
            .select(cols)
            .order("id")
            .range(off, off)
            .execute()
        )
        data = list(res.data or [])
        if not data:
            continue
        row = data[0]
        rid = row.get("id")
        if rid is None:
            continue
        rows_out[str(rid)] = row
    return list(rows_out.values())


def log_classification_row(
    logf,
    *,
    name: str,
    company: str,
    position: str,
    prev_type: str | None,
    result: ClassifyResult | None,
    status: str,
) -> None:
    inp = {"name": name, "company": company, "position": position}
    if result is None:
        logf.write(
            json.dumps(
                {
                    "input": inp,
                    "prev_contact_type": prev_type,
                    "status": status,
                    "output": None,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
    else:
        logf.write(
            json.dumps(
                {
                    "input": inp,
                    "prev_contact_type": prev_type,
                    "status": status,
                    "output": {
                        "contact_type": result["contact_type"],
                        "sector": result["sector"],
                        "contact_type_confidence": result["contact_type_confidence"],
                        "sector_confidence": result["sector_confidence"],
                        "reasoning": result["reasoning"],
                    },
                },
                ensure_ascii=False,
            )
            + "\n"
        )
    logf.flush()


def flush_updates(
    supabase: Any,
    batch: list[dict[str, Any]],
    logf,
) -> None:
    if not batch:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in batch:
        cid = row["id"]
        update_payload = {
            "contact_type": row["contact_type"],
            "sector": row["sector"],
            "contact_type_confidence": row["contact_type_confidence"],
            "sector_confidence": row["sector_confidence"],
            "classification_reasoning": row["classification_reasoning"],
            "reclassified_at": now_iso,
            "classification_model": CLASSIFICATION_MODEL,
        }
        supabase.table("contacts").update(update_payload).eq("id", str(cid)).execute()
        logf.write(f"# db_updated id={cid}\n")
    logf.flush()
    batch.clear()


def write_sample_csv(rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "id",
        "previous_contact_type",
        "new_contact_type",
        "contact_type_confidence",
        "sector",
        "sector_confidence",
        "classification_reasoning",
        "classification_model",
        "name",
        "company",
        "position",
    ]
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})
    print(f"Wrote {CSV_PATH}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Re-classify contacts (Sonnet): sample CSV mode or full Supabase updates."
    )
    ap.add_argument(
        "--full",
        action="store_true",
        help="Fetch all contacts, classify, update rows in batches of 50 (ignored: --sample).",
    )
    ap.add_argument(
        "--sample",
        type=int,
        default=50,
        metavar="N",
        help="Random sample size; CSV only; no DB updates when not using --full. Default: 50.",
    )
    ap.add_argument(
        "--only-uncertain",
        action="store_true",
        help="With --full: only contacts where contact_type_confidence IS NULL OR = low.",
    )
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv or sys.argv[1:])
    if args.only_uncertain and not args.full:
        sys.exit("--only-uncertain applies only with --full")

    env = load_env()

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logf = LOG_PATH.open("a", encoding="utf-8")
    logf.write(
        f"\n--- run_start {datetime.now(timezone.utc).isoformat()} "
        f"full={args.full} sample={args.sample} only_uncertain={args.only_uncertain}\n"
    )
    logf.flush()

    from supabase import create_client
    import anthropic

    supabase = create_client(env["url"], env["service_key"])
    anthropic_client = anthropic.Anthropic(
        api_key=env["anthropic"],
        max_retries=4,
    )

    if args.full:
        rows = iter_all_contact_rows(supabase, only_uncertain=args.only_uncertain)
    else:
        rows = fetch_random_contact_sample(supabase, sample_n=args.sample)

    total_attempted = 0
    total_classified_ok = 0
    skipped_invalid = 0
    confidence_ct: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
    confidence_sector: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
    type_changed = 0
    type_unchanged = 0

    csv_accum: list[dict[str, Any]] = []
    update_buf: list[dict[str, Any]] = []

    for row in rows:
        total_attempted += 1
        rid = row.get("id")
        name = (row.get("name") or "").strip()
        position = (row.get("role") or "").strip()
        company = company_from_row(row)
        prev_type = normalize_contact_type(row.get("contact_type"))

        result = classify_contact_once(
            anthropic_client,
            name=name,
            company=company,
            position=position,
            logf=logf,
        )
        if result is None:
            skipped_invalid += 1
            log_classification_row(
                logf,
                name=name,
                company=company,
                position=position,
                prev_type=prev_type,
                result=None,
                status="skipped_invalid_output",
            )
            continue

        total_classified_ok += 1
        confidence_ct[result["contact_type_confidence"]] += 1
        confidence_sector[result["sector_confidence"]] += 1

        new_type = result["contact_type"]
        if prev_type is None:
            type_changed += 1
        elif new_type != prev_type:
            type_changed += 1
        else:
            type_unchanged += 1

        log_classification_row(
            logf,
            name=name,
            company=company,
            position=position,
            prev_type=prev_type,
            result=result,
            status="ok",
        )

        if args.full:
            assert rid is not None
            update_buf.append(
                {
                    "id": rid,
                    "contact_type": new_type,
                    "sector": result["sector"],
                    "contact_type_confidence": result["contact_type_confidence"],
                    "sector_confidence": result["sector_confidence"],
                    "classification_reasoning": result["reasoning"],
                }
            )
            if len(update_buf) >= UPDATE_BATCH:
                flush_updates(supabase, update_buf, logf=logf)
        else:
            assert rid is not None
            csv_accum.append(
                {
                    "id": str(rid),
                    "previous_contact_type": prev_type or "",
                    "new_contact_type": new_type,
                    "contact_type_confidence": result["contact_type_confidence"],
                    "sector": result["sector"],
                    "sector_confidence": result["sector_confidence"],
                    "classification_reasoning": result["reasoning"],
                    "classification_model": CLASSIFICATION_MODEL,
                    "name": name,
                    "company": company,
                    "position": position,
                }
            )

    if args.full and update_buf:
        flush_updates(supabase, update_buf, logf=logf)
    elif not args.full and csv_accum:
        write_sample_csv(csv_accum)

    print("Summary")
    print(f"  Total rows attempted:           {total_attempted}")
    print(f"  Successfully classified:        {total_classified_ok}")
    print(f"  Skipped (invalid model output): {skipped_invalid}")
    print("  Contact type confidence:        ", dict(sorted(confidence_ct.items())))
    print("  Sector confidence:            ", dict(sorted(confidence_sector.items())))
    print(f"  contact_type changed vs same: {type_changed} / {type_unchanged}")

    logf.write(
        json.dumps(
            {
                "summary": {
                    "total_attempted": total_attempted,
                    "successful_classifications": total_classified_ok,
                    "skipped_invalid": skipped_invalid,
                    "contact_type_confidence_dist": confidence_ct,
                    "sector_confidence_dist": confidence_sector,
                    "contact_type_changed": type_changed,
                    "contact_type_unchanged": type_unchanged,
                },
            },
            ensure_ascii=False,
        )
        + "\n"
    )
    logf.flush()
    logf.close()


if __name__ == "__main__":
    main()
