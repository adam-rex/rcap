/**
 * Quick checks for Quick Capture URL parsing + SSRF guard helpers.
 * Run: npx tsx scripts/verify-quick-capture-ssrf.ts
 */
import assert from "node:assert/strict";

import {
  isBlockedHostname,
  isNonPublicAddress,
} from "../lib/rex/fetch-public-page-text";
import { parseWebsiteUrlInputs } from "../lib/rex/quick-capture-urls";

assert.equal(isBlockedHostname("localhost"), true);
assert.equal(isBlockedHostname("foo.local"), true);
assert.equal(isBlockedHostname("metadata.google.internal"), true);
assert.equal(isBlockedHostname("example.com"), false);

assert.equal(isNonPublicAddress("127.0.0.1", 4), true);
assert.equal(isNonPublicAddress("10.0.0.1", 4), true);
assert.equal(isNonPublicAddress("192.168.0.1", 4), true);
assert.equal(isNonPublicAddress("8.8.8.8", 4), false);
assert.equal(isNonPublicAddress("::1", 6), true);
assert.equal(isNonPublicAddress("2001:4860:4860::8888", 6), false);

assert.deepEqual(parseWebsiteUrlInputs(""), []);
assert.deepEqual(parseWebsiteUrlInputs("  \n  "), []);
assert.deepEqual(parseWebsiteUrlInputs("https://a.com\nhttps://b.com"), [
  "https://a.com",
  "https://b.com",
]);
assert.deepEqual(parseWebsiteUrlInputs("https://a.com, https://b.com"), [
  "https://a.com",
  "https://b.com",
]);

console.log("verify-quick-capture-ssrf: ok");
