import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serviceWorker } from '../../src/sw/worker.ts';

// The offline worker against a fake worker scope, cache storage and network.

const ORIGIN = 'https://vivi.test';
const SCOPE = `${ORIGIN}/app/`;

type Handler = (e: Record<string, unknown>) => void;

let handlers: Record<string, Handler>;
let stores: Map<string, Map<string, Response>>;
let online: boolean;
let fetched: string[];
const g = globalThis as unknown as Record<string, unknown>;
const saved = { self: g['self'], caches: g['caches'], fetch: g['fetch'] };

const key = (url: string, ignoreSearch = false): string => {
  const u = new URL(url);
  if (ignoreSearch) u.search = '';
  return u.href;
};

function fakeCache(store: Map<string, Response>) {
  return {
    async addAll(urls: string[]) {
      for (const u of urls) store.set(key(u), await (g['fetch'] as typeof fetch)(u));
    },
    async put(req: Request, res: Response) {
      store.set(key(req.url), res);
    },
    async match(req: Request | string, opts: { ignoreSearch?: boolean } = {}) {
      const url = typeof req === 'string' ? req : req.url;
      for (const [k, v] of store) if (key(k, opts.ignoreSearch) === key(url, opts.ignoreSearch)) return v.clone();
      return undefined;
    },
  };
}

beforeEach(() => {
  handlers = {};
  stores = new Map([['vivi-old', new Map()], ['someone-else', new Map()]]);
  online = true;
  fetched = [];
  g['self'] = {
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGIN, href: `${SCOPE}sw.js` },
  };
  g['caches'] = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return fakeCache(stores.get(name)!);
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  g['fetch'] = async (input: Request | string) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!online) throw new TypeError('Failed to fetch');
    fetched.push(url);
    return Object.defineProperty(new Response(`body of ${new URL(url).pathname}`), 'type', { value: 'basic' });
  };
  serviceWorker('v1', ['./', 'index.html', 'assets/index-abc.js', 'plates/plates.json']);
});

afterEach(() => Object.assign(g, saved));

/** Run an event through its handler, resolving what it waits for or responds with. */
async function dispatch(type: string, extra: Record<string, unknown> = {}): Promise<{ waited?: unknown; response?: Response; handled: boolean }> {
  let waited: Promise<unknown> | undefined;
  let responded: Promise<Response> | undefined;
  handlers[type]!({ ...extra, waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<Response>) => (responded = p) });
  return { waited: await waited, handled: responded !== undefined, ...(responded ? { response: await responded } : {}) };
}

const get = (path: string, mode: RequestMode = 'cors'): Request => {
  const req = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(req, 'mode', { value: mode });
  return req;
};

describe('the offline service worker', () => {
  it('keeps every file at install, resolved against its own folder', async () => {
    await dispatch('install');
    expect([...stores.get('vivi-v1')!.keys()]).toEqual([`${SCOPE}`, `${SCOPE}index.html`, `${SCOPE}assets/index-abc.js`, `${SCOPE}plates/plates.json`]);
  });

  it('drops older versions of its own caches when it takes over, and nobody else’s', async () => {
    await dispatch('install');
    await dispatch('activate');
    expect([...stores.keys()].sort()).toEqual(['someone-else', 'vivi-v1']);
  });

  it('serves kept files without the network, ignoring ?switches', async () => {
    await dispatch('install');
    fetched = [];
    online = false;
    const { response } = await dispatch('fetch', { request: get('/app/plates/plates.json?fxstats') });
    expect(await response!.text()).toBe('body of /app/plates/plates.json');
    expect(fetched).toEqual([]);
  });

  it('fetches and keeps anything else, such as a recorded giggle', async () => {
    await dispatch('install');
    const req = get('/app/sounds/giggles/a.mp3');
    expect(await (await dispatch('fetch', { request: req })).response!.text()).toBe('body of /app/sounds/giggles/a.mp3');
    online = false;
    expect(await (await dispatch('fetch', { request: req })).response!.text()).toBe('body of /app/sounds/giggles/a.mp3');
  });

  it('offline, a page it has never seen gets the game', async () => {
    await dispatch('install');
    online = false;
    const { response } = await dispatch('fetch', { request: get('/app/somewhere', 'navigate') });
    expect(await response!.text()).toBe('body of /app/');
    await expect(dispatch('fetch', { request: get('/app/missing.png') })).rejects.toThrow();
  });

  it('leaves other sites and non-GET requests alone', async () => {
    expect((await dispatch('fetch', { request: new Request('https://elsewhere.test/x.js') })).handled).toBe(false);
    expect((await dispatch('fetch', { request: new Request(`${ORIGIN}/app/x`, { method: 'POST' }) })).handled).toBe(false);
  });
});
