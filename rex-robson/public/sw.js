const CACHE_NAME = `rex-pwa-${self.__REX_BUILD_ID__ || Date.now()}`;
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/pwa-icon/192",
  "/pwa-icon/512",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (
    (sameOrigin && url.pathname.startsWith("/_next/")) ||
    (sameOrigin && url.pathname.startsWith("/api/")) ||
    (sameOrigin && url.search.includes("_rsc=")) ||
    url.hostname.endsWith(".supabase.co") ||
    url.hostname === "api.anthropic.com"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          if (!navigator.onLine) {
            const fallback = await caches.match("/");
            return fallback ?? Response.error();
          }
          return Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const revalidate = fetch(request)
        .then((response) => {
          if (response.status === 200 && response.type === "basic") {
            return cache.put(request, response.clone());
          }
        })
        .catch(() => {});

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response.status === 200 && response.type === "basic") {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
