/* Cache only the public offline document and immutable app assets. No private pages/API. */
const CACHE = "lexis-public-shell-v1";
const OFFLINE = "/offline";
const STATIC = "/_next/static/";
let purging = false;
const writes = new Set();
function trackedWrite(operation) {
  if (purging) return Promise.resolve();
  const pending = operation();
  writes.add(pending);
  return pending.finally(() => writes.delete(pending));
}
function preparePublicShell() {
  return trackedWrite(async () => {
    const response = await fetch(OFFLINE, {
      credentials: "omit",
      cache: "reload",
    });
    if (!response.ok)
      throw new Error("Offline workspace could not be prepared.");
    const html = await response.clone().text();
    if (purging) return;
    const cache = await caches.open(CACHE);
    if (purging) return;
    await cache.put(OFFLINE, response);
    const assets = [
      ...new Set(
        [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
          .map((match) => match[1].replaceAll("&amp;", "&"))
          .filter((url) => url.startsWith(STATIC)),
      ),
    ];
    if (!purging)
      await cache.addAll([
        ...assets,
        "/icon.svg",
        "/icon-192.png",
        "/icon-512.png",
        "/apple-touch-icon.png",
        "/manifest.webmanifest",
      ]);
    // Updates wait for an explicit learner action; no automatic reload of active work.
  });
}
self.addEventListener("install", (event) =>
  event.waitUntil(preparePublicShell()),
);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    trackedWrite(async () => {
      for (const name of await caches.keys())
        if (
          !purging &&
          name.startsWith("lexis-public-shell-") &&
          name !== CACHE
        )
          await caches.delete(name);
      if (!purging) await self.clients.claim();
    }),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "LEXIS_PREPARE_PURGE") {
    purging = true;
    event.waitUntil(
      Promise.allSettled([...writes]).then(() =>
        event.ports[0]?.postMessage({ type: "LEXIS_PURGE_READY" }),
      ),
    );
  } else if (event.data?.type === "LEXIS_PREPARE_OFFLINE" && !purging) {
    event.waitUntil(
      preparePublicShell().then(
        () => event.ports[0]?.postMessage({ ok: !purging }),
        () => event.ports[0]?.postMessage({ ok: false }),
      ),
    );
  } else if (event.data?.type === "LEXIS_APPLY_UPDATE" && !purging)
    void self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (purging || request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    /^\/(?:api|auth|account)(?:\/|$)/.test(url.pathname) ||
    url.searchParams.has("_rsc")
  )
    return;
  if (
    url.pathname.startsWith(STATIC) ||
    [
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/apple-touch-icon.png",
      "/manifest.webmanifest",
    ].includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        if (!purging) {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
        }
        const response = await fetch(request);
        if (response.ok && !purging) {
          try {
            await trackedWrite(async () => {
              const cache = await caches.open(CACHE);
              if (!purging) await cache.put(request, response.clone());
            });
          } catch {
            /* Cache quota failures never block online assets. */
          }
        }
        return response;
      })(),
    );
  } else if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = purging
          ? null
          : await (await caches.open(CACHE)).match(OFFLINE);
        return (
          cached ??
          new Response(
            "LEXIS offline workspace is not available. Reconnect to prepare it.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          )
        );
      }),
    );
  }
});
