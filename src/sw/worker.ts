// The offline service worker. The build (vite.config.ts) writes dist/sw.js as a
// call to this function with the build's version and every file the game needs,
// so it must use nothing but its arguments and the worker's own globals.
//
// - Install: keep every file (about 300 KB), then take over straight away.
// - Activate: drop older versions' caches.
// - Fetch: same-origin GETs come from the cache first; anything else fetched
//   (recorded giggles, say) is kept for next time. Offline, a page request
//   gets the cached game.

/** The parts of the service worker's world this uses (the project's DOM types have no worker scope). */
interface WaitUntil {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEventLike extends WaitUntil {
  readonly request: Request;
  respondWith(r: Promise<Response>): void;
}
interface WorkerScope {
  addEventListener(type: 'install' | 'activate', fn: (e: WaitUntil) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEventLike) => void): void;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  readonly location: { readonly origin: string; readonly href: string };
}

export function serviceWorker(version: string, files: readonly string[]): void {
  const scope = self as unknown as WorkerScope;
  const name = `vivi-${version}`;
  const shell = new URL('./', scope.location.href).href;

  scope.addEventListener('install', (e) => {
    e.waitUntil(
      caches
        .open(name)
        .then((cache) => cache.addAll(files.map((f) => new URL(f, scope.location.href).href)))
        .then(() => scope.skipWaiting()),
    );
  });

  scope.addEventListener('activate', (e) => {
    e.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vivi-') && k !== name).map((k) => caches.delete(k))))
        .then(() => scope.clients.claim()),
    );
  });

  scope.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== scope.location.origin) return;
    e.respondWith(
      (async () => {
        const cache = await caches.open(name);
        // ?fxstats and other switches don't change the files, and a Vary header (Origin from a
        // crossorigin script, or Accept-Encoding) shouldn't hide a file kept at install.
        const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok && res.type === 'basic') void cache.put(req, res.clone());
          return res;
        } catch (err) {
          if (req.mode === 'navigate') {
            const page = await cache.match(shell, { ignoreVary: true });
            if (page) return page;
          }
          throw err;
        }
      })(),
    );
  });
}
