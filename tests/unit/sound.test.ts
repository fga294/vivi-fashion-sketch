import { describe, expect, it } from 'vitest';
import { nextGiggle, parseSoundManifest } from '../../src/audio/sound.ts';
import { BLIP, GAP, GIGGLE_VOICES, giggleScore } from '../../src/audio/synth.ts';
import { mulberry32 } from '../../src/engine/random.ts';
import { DEFAULT_PREFS, readPrefs, writePrefs } from '../../src/storage/prefs.ts';

describe('nextGiggle', () => {
  it('never picks the same giggle twice in a row, and uses every one', () => {
    for (const count of [2, 3, 4, 7]) {
      const rnd = mulberry32(count);
      const seen = new Array<number>(count).fill(0);
      let last = -1;
      for (let i = 0; i < 2000; i++) {
        const next = nextGiggle(count, last, rnd);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(count);
        expect(next).not.toBe(last);
        seen[next]!++;
        last = next;
      }
      // Roughly even: each giggle within ±25% of its fair share.
      for (const n of seen) expect(Math.abs(n - 2000 / count)).toBeLessThan((2000 / count) * 0.25);
    }
  });

  it('copes with one giggle, no history, or a history from a longer list', () => {
    expect(nextGiggle(1, 0, Math.random)).toBe(0);
    expect(nextGiggle(0, -1, Math.random)).toBe(0);
    expect(nextGiggle(4, -1, () => 0.99)).toBe(3);
    expect(nextGiggle(3, 5, () => 0)).toBe(0);
    // The edges of random(): never `last`, never out of range.
    expect(nextGiggle(4, 3, () => 0.999999)).toBe(2);
    expect(nextGiggle(4, 0, () => 0)).toBe(1);
  });
});

describe('fallback giggle', () => {
  it('has at least four distinct voices', () => {
    expect(GIGGLE_VOICES.length).toBeGreaterThanOrEqual(4);
    const shapes = new Set(GIGGLE_VOICES.map((_, i) => JSON.stringify(giggleScore(i))));
    expect(shapes.size).toBe(GIGGLE_VOICES.length);
  });

  it('is 5–7 blips of 70 ms with 40 ms gaps, falling from about 520 Hz to 420 Hz', () => {
    GIGGLE_VOICES.forEach((_, v) => {
      const { blips, formants, length } = giggleScore(v);
      expect(blips.length).toBeGreaterThanOrEqual(5);
      expect(blips.length).toBeLessThanOrEqual(7);
      blips.forEach((b, i) => {
        expect(b.dur).toBeCloseTo(BLIP, 6);
        if (i > 0) expect(b.t - blips[i - 1]!.t - BLIP).toBeCloseTo(GAP, 6);
        expect(b.f1).toBeLessThan(b.f0); // each "hee" falls a little
        if (i > 0) expect((b.f0 + b.f1) / 2).toBeLessThanOrEqual((blips[i - 1]!.f0 + blips[i - 1]!.f1) / 2);
      });
      const mid = (b: (typeof blips)[number]): number => (b.f0 + b.f1) / 2;
      expect(Math.abs(mid(blips[0]!) - 520)).toBeLessThan(35);
      expect(Math.abs(mid(blips[blips.length - 1]!) - 420)).toBeLessThan(15);
      expect(Math.abs(formants[0] - 1000)).toBeLessThan(100);
      expect(Math.abs(formants[1] - 2500)).toBeLessThan(150);
      expect(length).toBeCloseTo(blips.length * BLIP + (blips.length - 1) * GAP, 6);
    });
  });

  it('shifts pitch with the rate but keeps timing and formants', () => {
    const a = giggleScore(1, 1);
    const b = giggleScore(1, 1.08);
    expect(b.blips[0]!.f0 / a.blips[0]!.f0).toBeCloseTo(1.08, 6);
    expect(b.length).toBe(a.length);
    expect(b.formants).toEqual(a.formants);
  });
});

describe('sound manifest', () => {
  it('reads lists of files and ignores anything else', () => {
    expect(parseSoundManifest({ giggles: ['giggles/a.mp3', 3, ''], tada: ['tada/t.mp3'] })).toEqual({
      giggles: ['giggles/a.mp3'],
      tada: ['tada/t.mp3'],
    });
    expect(parseSoundManifest(null)).toEqual({ giggles: [], tada: [] });
    expect(parseSoundManifest({ giggles: 'nope' })).toEqual({ giggles: [], tada: [] });
  });
});

describe('prefs', () => {
  const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('saves and reads back the sound setting', () => {
    const store = memory();
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    expect(writePrefs({ sound: false }, store)).toEqual({ ...DEFAULT_PREFS, sound: false });
    expect(readPrefs(store)).toEqual({ ...DEFAULT_PREFS, sound: false });
  });

  it('saves Stay inside alongside sound, and keeps the other setting', () => {
    const store = memory();
    expect(DEFAULT_PREFS.stayInside).toBe(true);
    writePrefs({ sound: false }, store);
    expect(writePrefs({ stayInside: false }, store)).toEqual({ sound: false, stayInside: false });
    store.data.set('vivi-fashion-dresses:prefs', '{"stayInside":"no","sound":false}');
    expect(readPrefs(store)).toEqual({ sound: false, stayInside: true });
  });

  it('falls back to defaults on missing, corrupt or blocked storage', () => {
    const store = memory();
    store.data.set('vivi-fashion-dresses:prefs', '{not json');
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    store.data.set('vivi-fashion-dresses:prefs', '{"sound":"yes"}');
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
    const blocked = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readPrefs(blocked)).toEqual(DEFAULT_PREFS);
    expect(writePrefs({ sound: false }, blocked)).toEqual({ ...DEFAULT_PREFS, sound: false }); // applies, just isn't saved
  });
});
