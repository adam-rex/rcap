#!/usr/bin/env python3
"""
LinkedIn connections CSV → Supabase contacts (Phase 2).

Requires: pip install -r scripts/import-linkedin-requirements.txt

Env (from repo root .env.local): SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (unless --skip-classify).

Sector taxonomy must match lib/constants/sectors.ts (WORKSPACE_SECTOR_SLUGS).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
LOG_PATH = ROOT / "scripts" / "import-linkedin.log"
BATCH_SIZE = 100

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


def normalize_linkedin_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    return u.rstrip("/").lower()


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
    if s in VALID_SECTORS:
        return s
    return None


def parse_two_line_classification(raw: str) -> tuple[str | None, str | None]:
    """Parse contact_type and sector from model output (two-line keyed format)."""
    ctype: str | None = None
    sector: str | None = None
    for ln in raw.splitlines():
        line = ln.strip()
        if not line or ":" not in line:
            continue
        key, _, rest = line.partition(":")
        k = key.strip().lower().replace(" ", "_")
        val = rest.strip()
        if k == "contact_type":
            ctype = val or None
        elif k == "sector":
            sector = val or None
    return ctype, sector


def validate_classification(
    raw: str,
    *,
    logf,
    company: str,
    position: str,
) -> tuple[str, str]:
    """
    Return (contact_type, sector) with independent fallbacks:
    invalid/missing type → Corporate; invalid/missing sector → other.
    """
    ct_raw, sec_raw = parse_two_line_classification(raw)
    ct = normalize_contact_type(ct_raw)
    sec = normalize_sector_slug(sec_raw)
    if ct is None:
        ct = "Corporate"
        logf.write(
            f"# warn invalid_contact_type raw={raw!r} extracted={ct_raw!r} "
            f"defaulted=Corporate company={company!r} position={position!r}\n"
        )
    if sec is None:
        sec = "other"
        logf.write(
            f"# warn invalid_sector raw={raw!r} extracted={sec_raw!r} "
            f"defaulted=other company={company!r} position={position!r}\n"
        )
    logf.flush()
    return ct, sec


def parse_connected_on(s: str) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d %b %Y").date()
    except ValueError:
        try:
            return datetime.strptime(s, "%d %B %Y").date()
        except ValueError:
            return None


def load_env(*, need_anthropic: bool) -> dict[str, str]:
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
    if need_anthropic and not anth.strip():
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        sys.exit(f"Missing env in .env.local: {', '.join(missing)}")
    return {"url": url, "service_key": key, "anthropic": anth}  # type: ignore[return-value]


def resolve_csv_path(arg: Path | None) -> Path:
    if arg is not None:
        p = arg if arg.is_absolute() else ROOT / arg
        if p.exists():
            return p
        sys.exit(f"CSV not found: {p}")
    primary = ROOT / "imports" / "Connections_James_LI.csv"
    if primary.exists():
        return primary
    alt = ROOT / "imports" / "Connections James LI.csv"
    if alt.exists():
        return alt
    sys.exit(
        f"CSV not found. Expected {primary} (or {alt}). "
        "Rename your export or pass --csv path/to/file.csv"
    )


def iter_data_rows(csv_path: Path):
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        headers: list[str] | None = None
        for row in reader:
            if row and row[0].strip() == "First Name":
                headers = [c.strip() for c in row]
                break
        if not headers:
            sys.exit("Could not find header row starting with 'First Name'")
        for row in reader:
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[: len(headers)]
            yield dict(zip(headers, row))


def load_existing_linkedin_urls(supabase: Any) -> set[str]:
    """Normalized URLs already in contacts."""
    out: set[str] = set()
    start = 0
    page_size = 1000
    while True:
        res = (
            supabase.table("contacts")
            .select("linkedin_url")
            .not_.is_("linkedin_url", "null")
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = res.data or []
        for r in rows:
            u = r.get("linkedin_url") or ""
            nu = normalize_linkedin_url(u)
            if nu:
                out.add(nu)
        if len(rows) < page_size:
            break
        start += page_size
    return out


def get_or_create_org(
    supabase: Any,
    company: str,
    cache: dict[str, str],
    *,
    dry_run: bool,
    logf,
) -> str | None:
    name = company.strip()
    if not name:
        return None
    key = name.casefold()
    if key in cache:
        return cache[key]

    res = (
        supabase.table("organisations")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .execute()
    )
    if res.data:
        oid = res.data[0]["id"]
        cache[key] = oid
        return oid

    if dry_run:
        fake = str(uuid.uuid4())
        cache[key] = fake
        return fake

    ins = supabase.table("organisations").insert({"name": name}).execute()
    if not ins.data:
        return None
    oid = ins.data[0]["id"]
    cache[key] = oid
    return oid


def classify_contact(
    *,
    anthropic_client: Any,
    classify_cache: dict[tuple[str, str], tuple[str, str]],
    name: str,
    company: str,
    position: str,
    skip_classify: bool,
    logf,
    inter_call_delay_s: float,
) -> tuple[str, str]:
    """Return (contact_type, sector)."""
    if skip_classify:
        return "Corporate", "other"

    ckey = (company.strip().casefold(), position.strip().casefold())
    if ckey in classify_cache:
        return classify_cache[ckey]

    prompt = f"""Classify this person on TWO dimensions: contact_type and sector.

CONTACT_TYPE — pick ONE of: Founder, Investor, Lender, Advisor, Corporate, Other
Rules:
- Founder: Position contains "founder"/"co-founder"/"founding", OR Position is C-suite (CEO/CTO/COO/CFO) AT a clear startup (small named company, "Stealth", "YC W##", etc.). Don't infer founder status from company name alone.
- Investor: Position or Company indicates equity investment — "Partner", "Principal", "VC", "Venture", "Capital", "Investments", "Equity", "Family Office", "LP". For Family Offices without those keywords, still classify as Investor.
- Lender: Position or Company specifically references "credit", "debt", "lending", "loans", "venture debt", or specific debt funds.
- Advisor: Position contains "consultant", "advisor", "consulting", "M&A advisory", "strategy advisor". Independent consultants, M&A boutiques, transaction advisory.
- Other: clearly non-business roles — students, retirees, board memberships at clubs, volunteer roles, journalists, sports, government (non-policy).
- Corporate: DEFAULT for everything else — standard employees at established companies that aren't investment/lending firms.

SECTOR — pick ONE of (lowercase snake_case): fintech, wealth_asset_management, insurance_insurtech, crypto_web3, capital_markets, saas_b2b, consumer_tech, enterprise_software, cybersecurity, ai_ml, developer_tools, data_analytics, healthcare_services, biotech_pharma, medtech_devices, digital_health, consumer_brands, ecommerce_marketplaces, retail, media_entertainment, hospitality_travel, real_estate_proptech, construction_built_environment, industrials_manufacturing, logistics_supply_chain, energy_climate, agriculture_food, professional_services, education_edtech, government_public_sector, nonprofit_social_impact, other

Rules:
- For investors/lenders/advisors: pick the sector they primarily focus on (often clear from firm name)
- For founders/corporates: pick the sector their company operates in
- Avoid "other" — pick the closest fit
- Specificity beats generality (use "fintech" not "saas_b2b" for a payments company)

Name: {name}
Company: {company}
Position: {position}

Respond with EXACTLY two lines:
contact_type: <value>
sector: <value>

No other output."""

    raw = ""
    for attempt in range(6):
        try:
            time.sleep(inter_call_delay_s)
            msg = anthropic_client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=128,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text if msg.content else ""
            break
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
    else:
        raise RuntimeError("Claude API rate-limited; exhausted retries") from None

    ct, sec = validate_classification(
        raw, logf=logf, company=company, position=position
    )
    classify_cache[ckey] = (ct, sec)
    return ct, sec


def _log_insert_line(logf, m: dict[str, Any], prefix: str) -> None:
    logf.write(
        f"{prefix} | type={m['contact_type']} | sector={m['sector']} | "
        f"Position={m['position']!r} Company={m['company']!r} "
        f"name={m['name']!r}\n"
    )


def flush_batch(
    supabase: Any,
    batch: list[dict[str, Any]],
    *,
    dry_run: bool,
    logf,
    summary: dict[str, int],
):
    if not batch:
        return
    if dry_run:
        for meta in batch:
            summary["inserted_dry"] += 1
            m = meta["_meta"]
            logf.write(
                f"dry-run | would insert | type={m['contact_type']} | sector={m['sector']} | "
                f"Position={m['position']!r} Company={m['company']!r} "
                f"name={m['name']!r} url={m['url']!r}\n"
            )
        logf.flush()
        batch.clear()
        return

    rows = [{k: v for k, v in item.items() if k != "_meta"} for item in batch]
    try:
        supabase.table("contacts").insert(rows).execute()
        for meta in batch:
            summary["inserted"] += 1
            _log_insert_line(logf, meta["_meta"], "inserted")
        logf.flush()
    except Exception as e:
        print(f"Batch insert failed ({e!r}); retrying row-by-row …", file=sys.stderr)
        logf.write(f"# batch_failed error={e!r}\n")
        for meta in batch:
            row = {k: v for k, v in meta.items() if k != "_meta"}
            try:
                supabase.table("contacts").insert(row).execute()
                summary["inserted"] += 1
                _log_insert_line(logf, meta["_meta"], "inserted")
            except Exception as ee:
                summary["failed"] += 1
                m = meta["_meta"]
                logf.write(
                    f"failed | error={ee!r} | type={m['contact_type']} | sector={m['sector']} | "
                    f"Position={m['position']!r} Company={m['company']!r} "
                    f"name={m['name']!r} url={m['url']!r}\n"
                )
        logf.flush()
    batch.clear()


def main() -> None:
    ap = argparse.ArgumentParser(description="Import LinkedIn connections CSV into Supabase.")
    ap.add_argument("--dry-run", action="store_true", help="Parse and classify only; no Supabase writes.")
    ap.add_argument("--limit", type=int, default=None, metavar="N", help="Process at most N data rows after header.")
    ap.add_argument(
        "--skip-classify",
        action="store_true",
        help='Set contact_type to "Corporate" and sector to "other" without calling Claude.',
    )
    ap.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="CSV path (default: imports/Connections_James_LI.csv or Connections James LI.csv).",
    )
    ap.add_argument(
        "--delay",
        type=float,
        default=0.15,
        metavar="SEC",
        help="Sleep before each Claude API call (skipped on cache hit). Default 0.15.",
    )
    args = ap.parse_args()

    env = load_env(need_anthropic=not args.skip_classify)
    csv_path = resolve_csv_path(args.csv)

    from supabase import create_client
    import anthropic

    supabase = create_client(env["url"], env["service_key"])
    anth_client: Any | None
    if args.skip_classify:
        anth_client = None
    else:
        anth_client = anthropic.Anthropic(
            api_key=env["anthropic"],
            max_retries=4,
        )

    existing_urls = load_existing_linkedin_urls(supabase)
    seen_urls: set[str] = set(existing_urls)
    org_cache: dict[str, str] = {}
    classify_cache: dict[tuple[str, str], tuple[str, str]] = {}

    summary = {
        "inserted": 0,
        "inserted_dry": 0,
        "skipped_duplicate": 0,
        "skipped_no_name": 0,
        "skipped_no_url": 0,
        "failed": 0,
    }

    pending: list[dict[str, Any]] = []
    rows_seen = 0

    with LOG_PATH.open("w", encoding="utf-8") as logf:
        logf.write(
            f"# import-linkedin csv={csv_path} dry_run={args.dry_run} "
            f"limit={args.limit} skip_classify={args.skip_classify}\n"
        )

        for row in iter_data_rows(csv_path):
            if args.limit is not None and rows_seen >= args.limit:
                break
            rows_seen += 1

            first = (row.get("First Name") or "").strip()
            last = (row.get("Last Name") or "").strip()
            if not first and not last:
                summary["skipped_no_name"] += 1
                logf.write("skipped (no name) | row_keys_empty_name\n")
                continue

            name = f"{first} {last}".strip()
            url_raw = (row.get("URL") or "").strip()
            nu = normalize_linkedin_url(url_raw)
            if not nu:
                summary["skipped_no_url"] += 1
                logf.write(f"skipped (no linkedin URL) | name={name!r}\n")
                continue

            if nu in seen_urls:
                summary["skipped_duplicate"] += 1
                logf.write(f"skipped (duplicate URL) | url={url_raw!r} name={name!r}\n")
                continue

            company = row.get("Company") or ""
            position = row.get("Position") or ""
            email_cell = (row.get("Email Address") or "").strip()
            email_val = email_cell if email_cell else None

            co_on = parse_connected_on(row.get("Connected On") or "")
            if co_on is None and (row.get("Connected On") or "").strip():
                logf.write(f"# warn bad_connected_on name={name!r} raw={row.get('Connected On')!r}\n")

            try:
                ctype, sector = classify_contact(
                    anthropic_client=anth_client,
                    classify_cache=classify_cache,
                    name=name,
                    company=company,
                    position=position,
                    skip_classify=args.skip_classify,
                    logf=logf,
                    inter_call_delay_s=0.0 if args.skip_classify else args.delay,
                )
            except Exception as e:
                summary["failed"] += 1
                logf.write(
                    f"failed | error={e!r} | stage=classify | name={name!r} "
                    f"Company={company!r} Position={position!r}\n"
                )
                logf.flush()
                continue

            oid = get_or_create_org(supabase, company, org_cache, dry_run=args.dry_run, logf=logf)
            if oid is None and company.strip():
                summary["failed"] += 1
                logf.write(
                    f"failed | error=organisation insert/lookup failed | type={ctype} | sector={sector} | "
                    f"name={name!r} Company={company!r}\n"
                )
                logf.flush()
                continue

            seen_urls.add(nu)

            rec: dict[str, Any] = {
                "name": name,
                "organisation_id": oid,
                "role": position.strip() or None,
                "contact_type": ctype,
                "sector": sector,
                "sectors": [sector],
                "email": email_val,
                "linkedin_url": url_raw,
                "connected_on": co_on.isoformat() if co_on else None,
                "internal_owner": "James",
                "source": "linkedin_import",
                "_meta": {
                    "name": name,
                    "url": url_raw,
                    "company": company,
                    "position": position,
                    "contact_type": ctype,
                    "sector": sector,
                },
            }
            pending.append(rec)
            if len(pending) >= BATCH_SIZE:
                flush_batch(
                    supabase,
                    pending,
                    dry_run=args.dry_run,
                    logf=logf,
                    summary=summary,
                )

        flush_batch(
            supabase,
            pending,
            dry_run=args.dry_run,
            logf=logf,
            summary=summary,
        )

    print("---")
    if args.dry_run:
        print(f"Would insert (dry-run): {summary['inserted_dry']}")
    else:
        print(f"Inserted: {summary['inserted']}")
    print(f"Skipped (duplicate URL): {summary['skipped_duplicate']}")
    print(f"Skipped (no name): {summary['skipped_no_name']}")
    print(f"Skipped (no LinkedIn URL): {summary['skipped_no_url']}")
    print(f"Failed: {summary['failed']}")
    print(f"Log: {LOG_PATH}")


if __name__ == "__main__":
    main()
