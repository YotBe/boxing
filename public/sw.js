/**
 * Offline service worker.
 *
 * The point of this file is a single scenario: the venue's wifi is broken,
 * blocked, or behind a captive portal, and the app still has to come up and
 * run. Everything the engine needs — app shell, MediaPipe's WASM runtime, and
 * the pose model files — is served from the Cache API on every load after the
 * first, so a cold start on a dead network is the same cold start as on a good
 * one.
 *
 * Nothing large is precached during `install`. The runtime is ~11MB and the two
 * models are ~15MB together; downloading them a second time during install,
 * while the page is already fetching them itself, would double the cost of the
 * very first load for no benefit. Instead the fetch handler caches those paths
 * as the app requests them, and the page asks for a background `warm` of
 * anything still missing once it is up and running.
 */

const CACHE = 'pose-engine-v1';

// The worker's own scope is the deployment's base path, so the same file works
// at a domain root and in a subdirectory (a GitHub Pages project site) without
// being told which it is. Always ends in a slash.
const BASE = new URL(self.registration.scope).pathname;

// Small enough to be worth having before the first navigation completes.
const SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}favicon.svg`];

// Big immutable assets: always answered from cache when present.
const CACHE_FIRST = ['wasm/', 'models/', 'assets/'].map((p) => BASE + p);

function isCacheFirst(pathname) {
  return CACHE_FIRST.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Cache lookups deliberately ignore Vary.
 *
 * Hosts routinely answer static assets with `Vary: Origin` or
 * `Vary: Accept-Encoding`. The Cache API honours that by default, so an entry
 * stored by a worker-initiated fetch will not match the page's own request for
 * the same URL when their headers differ — a silent miss that falls through to
 * the network and, offline, fails outright. Every URL cached here is an
 * immutable build artifact where the response cannot legitimately vary, so
 * matching on the URL alone is both correct and the only thing that survives
 * being served from a real CDN.
 */
const MATCH = { ignoreVary: true };

/** Serve from cache, falling back to network and populating the cache on miss. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Prefer the network so a redeploy is picked up, but never let a hanging
 * connection hold the page hostage — a captive portal that accepts the socket
 * and then never answers is the failure mode this timeout exists for.
 */
async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      fetch(request).then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit =
      (await cache.match(request, MATCH)) ||
      (await cache.match(`${BASE}index.html`, MATCH));
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, 1500));
    return;
  }

  if (isCacheFirst(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    cacheFirst(request).catch(() => fetch(request)),
  );
});

/**
 * `warm`: fetch and cache any of the given URLs that are not already stored,
 * then report back. The page uses the reply to show whether it is genuinely
 * safe to pull the network out.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const results = await Promise.all(
        data.urls.map(async (url) => {
          try {
            if (await cache.match(url, MATCH)) return true;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return false;
            await cache.put(url, res.clone());
            return true;
          } catch {
            return false;
          }
        }),
      );
      const ready = results.every(Boolean);
      const message = { type: 'warm-result', ready };

      // `includeUncontrolled` matters: on the very first load the page that
      // asked for this is not yet controlled by the worker, so a default
      // matchAll returns nothing and the reply goes nowhere — leaving the page
      // showing "Caching…" forever even though everything is stored.
      const clients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: 'window',
      });
      if (clients.length > 0) clients.forEach((c) => c.postMessage(message));
      else if (event.source) event.source.postMessage(message);
    })(),
  );
});
