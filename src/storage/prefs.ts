// Player settings in localStorage. Every read and write is wrapped, so private
// browsing or blocked storage just means settings don't stick.

/** Motion: follow the device's setting, or always reduce it, or always allow it. */
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Prefs {
  readonly sound: boolean;
  /** 0–1, under the master level. */
  readonly volume: number;
  /** The plates show faintly through the paper (8%). */
  readonly peek: boolean;
  /** Pattern strokes stay inside the closed area they start in. */
  readonly stayInside: boolean;
  readonly motion: MotionPref;
}

export const DEFAULT_PREFS: Prefs = { sound: true, volume: 1, peek: true, stayInside: true, motion: 'system' };

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
    const flag = (key: 'sound' | 'peek' | 'stayInside'): boolean => {
      const v = saved?.[key];
      return typeof v === 'boolean' ? v : DEFAULT_PREFS[key];
    };
    const volume = saved?.volume;
    const motion = saved?.motion;
    return {
      sound: flag('sound'),
      volume: typeof volume === 'number' && volume >= 0 && volume <= 1 ? volume : DEFAULT_PREFS.volume,
      peek: flag('peek'),
      stayInside: flag('stayInside'),
      motion: motion === 'reduce' || motion === 'full' || motion === 'system' ? motion : DEFAULT_PREFS.motion,
    };
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

/**
 * The settings in play: read once, changed in memory, and written through when
 * storage allows. With storage blocked, changes still apply until the page closes.
 */
export class Settings {
  private current: Prefs;
  private readonly store: Store | null;

  constructor(store: Store | null = localStore()) {
    this.store = store;
    this.current = readPrefs(store);
  }

  get value(): Prefs {
    return this.current;
  }

  update(change: Partial<Prefs>): Prefs {
    this.current = { ...this.current, ...change };
    try {
      this.store?.setItem(KEY, JSON.stringify(this.current));
    } catch {
      // Storage full or blocked: the setting still applies until the page closes.
    }
    return this.current;
  }
}
