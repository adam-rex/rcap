import * as dns from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { parseHTML } from "linkedom";

import { QUICK_CAPTURE_FETCH_MAX_URLS } from "./quick-capture-urls";

export { QUICK_CAPTURE_FETCH_MAX_URLS } from "./quick-capture-urls";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_EXCERPT_CHARS_PER_URL = 30_000;

/**
 * Hostnames we refuse before DNS (case-insensitive). Includes obvious SSRF targets.
 */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".metadata.google.internal")) {
    return true;
  }
  if (
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "169.254.169.254"
  ) {
    return true;
  }
  return false;
}

/**
 * True when this IPv4/IPv6 address must not be reached (private, loopback, link-local, multicast, etc.).
 */
export function isNonPublicAddress(address: string, family: 4 | 6): boolean {
  const raw = address.trim();
  if (family === 4) {
    const parts = raw.split(".");
    if (parts.length !== 4) return true;
    const o = parts.map((p) => Number.parseInt(p, 10));
    if (o.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return true;
    const [a, b] = o as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  const lower = raw.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fec0:") || lower.startsWith("fc00:")) {
    return true;
  }
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length);
    const tail = v4.includes("%") ? v4.split("%")[0]! : v4;
    if (isIPv4(tail)) return isNonPublicAddress(tail, 4);
  }
  return false;
}

async function assertHostnameResolvesToPublic(hostname: string): Promise<void> {
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve host");
  }
  if (records.length === 0) throw new Error("No DNS records for host");
  for (const r of records) {
    if (r.family !== 4 && r.family !== 6) continue;
    if (isNonPublicAddress(r.address, r.family as 4 | 6)) {
      throw new Error("Host resolves to a non-public address");
    }
  }
}

function tryParsePublicUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty URL");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const host = url.hostname;
  if (!host) throw new Error("Missing host");
  if (isBlockedHostname(host)) {
    throw new Error("Host is not allowed");
  }
  if (isIPv4(host)) {
    if (isNonPublicAddress(host, 4)) throw new Error("Address is not public");
    return url;
  }
  if (isIPv6(host)) {
    if (isNonPublicAddress(host, 6)) throw new Error("Address is not public");
    return url;
  }
  return url;
}

/** Validate URL shape and that hostname is not blocked / resolves only to public IPs. */
export async function validateHttpsUrlForFetch(
  raw: string,
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  try {
    const url = tryParsePublicUrl(raw);
    if (!isIPv4(url.hostname) && !isIPv6(url.hostname)) {
      await assertHostnameResolvesToPublic(url.hostname);
    }
    url.hash = "";
    return { ok: true, url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid URL";
    return { ok: false, error: message };
  }
}

export type FetchPublicPageTextOk = {
  ok: true;
  url: string;
  text: string;
};

export type FetchPublicPageTextErr = {
  ok: false;
  url: string;
  error: string;
};

export type FetchPublicPageTextResult = FetchPublicPageTextOk | FetchPublicPageTextErr;

function htmlToPlainText(html: string): string {
  const { document } = parseHTML(html);
  const root = document.body ?? document.documentElement;
  if (!root) return "";
  for (const sel of ["script", "style", "noscript", "svg", "template"]) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
  const text = (root.textContent ?? "").replace(/\s+/g, " ").trim();
  return text;
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Page is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchSinglePageFinalUrl(
  startUrl: URL,
  signal: AbortSignal,
): Promise<{ status: number; res: Response; finalUrl: URL }> {
  let current = new URL(startUrl.href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const validated = await validateHttpsUrlForFetch(current.href);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    current = validated.url;

    const res = await fetch(current.href, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "RexRobsonQuickCapture/1.0",
      },
    });

    if (REDIRECT_STATUSES.has(res.status)) {
      void res.body?.cancel();
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without Location");
      current = new URL(loc, current);
      continue;
    }

    return { status: res.status, res, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

/**
 * Fetch one HTTPS page and return plain text excerpt (SSRF-hardened).
 */
export async function fetchPublicPageText(rawUrl: string): Promise<FetchPublicPageTextResult> {
  const normalizedInput = rawUrl.trim();
  let displayUrl = normalizedInput;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let status = 0;
    let res: Response;
    let finalUrl: URL;
    try {
      const first = tryParsePublicUrl(normalizedInput);
      if (!isIPv4(first.hostname) && !isIPv6(first.hostname)) {
        await assertHostnameResolvesToPublic(first.hostname);
      }
      const out = await fetchSinglePageFinalUrl(first, controller.signal);
      status = out.status;
      res = out.res;
      finalUrl = out.finalUrl;
      displayUrl = finalUrl.href;
    } finally {
      clearTimeout(timer);
    }

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        url: displayUrl,
        error: `HTTP ${status}`,
      };
    }

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = await readBodyCapped(res, MAX_RESPONSE_BYTES);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = decoder.decode(buf);

    let plain: string;
    if (ct.includes("text/html") || ct.includes("application/xhtml") || /<\s*html[\s>]/i.test(rawText.slice(0, 500))) {
      plain = htmlToPlainText(rawText);
    } else if (ct.includes("text/plain")) {
      plain = rawText.replace(/\s+/g, " ").trim();
    } else {
      plain = rawText.replace(/\s+/g, " ").trim();
      if (plain.length > 500) {
        plain = plain.slice(0, 500) + "…";
      }
    }

    if (!plain) {
      return {
        ok: false,
        url: displayUrl,
        error: "No readable text from page",
      };
    }

    const text =
      plain.length > MAX_EXCERPT_CHARS_PER_URL
        ? `${plain.slice(0, MAX_EXCERPT_CHARS_PER_URL)}…`
        : plain;

    return { ok: true, url: displayUrl, text };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.name === "AbortError"
          ? "Request timed out"
          : e.message
        : "Fetch failed";
    return { ok: false, url: displayUrl, error: message };
  }
}

/**
 * Dedupe, cap count, and fetch each URL. Order preserved by first occurrence.
 */
export async function fetchPublicPageTexts(
  rawUrls: string[],
): Promise<FetchPublicPageTextResult[]> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const r of rawUrls) {
    const t = r.trim();
    if (!t) continue;
    let key: string;
    try {
      key = tryParsePublicUrl(t).href;
    } catch {
      key = t;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
    if (unique.length >= QUICK_CAPTURE_FETCH_MAX_URLS) break;
  }

  const out: FetchPublicPageTextResult[] = [];
  for (const u of unique) {
    out.push(await fetchPublicPageText(u));
  }
  return out;
}

/** Human-readable block for the capture LLM (empty if no results). */
export function formatFetchedPagesForPrompt(
  results: FetchPublicPageTextResult[],
): string {
  if (results.length === 0) return "";
  const lines: string[] = [
    "Fetched pages (trust only facts below; combine with the note and attachments above):",
    "",
  ];
  for (const r of results) {
    lines.push("---");
    if (r.ok) {
      lines.push(`URL: ${r.url}`, r.text, "");
    } else {
      lines.push(`URL: ${r.url}`, `(Could not fetch: ${r.error})`, "");
    }
  }
  return lines.join("\n").trimEnd();
}
