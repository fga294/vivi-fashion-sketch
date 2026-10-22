// Player settings in localStorage. Every read and write is wrapped, so private
// browsing or blocked storage just means settings don't stick. The settings
// panel (phase 8) adds volume, Peek, Stay inside and reduced motion.

export interface Prefs {
  readonly sound: boolean;
}

export const DEFAULT_PREFS: Prefs = { sound: true };

const KEY = 'vivi-fashion-dresses:prefs';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The page's localStorage, or null where touching it throws (blocked storage, some private modes). */
export function localStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPrefs(store: Store | null = localStore()): Prefs {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return { sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_PREFS.sound };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Merge `change` into the saved settings and return the result (saved or not). */
export function writePrefs(change: Partial<Prefs>, store: Store | null = localStore()): Prefs {
  const next = { ...readPrefs(store), ...change };
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the setting still applies until the page closes.
  }
  return next;
}
