/** Max URLs accepted per capture request (deduped); keep in sync with server fetch. */
export const QUICK_CAPTURE_FETCH_MAX_URLS = 5;

/**
 * Parse `urls` lines / comma-separated hints into a list for the API (shared client/server).
 */
export function parseWebsiteUrlInputs(blob: string): string[] {
  return blob
    .split(/\r?\n/)
    .flatMap((line) => line.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
