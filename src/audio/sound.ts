// The sound engine: one AudioContext, created and unlocked by the player's first
// gesture (iOS needs this), a master gain for mute, and every game sound. Most
// sounds are synthesized (synth.ts); giggles and the Ta-da use recorded clips
// from public/sounds/ when they exist.

import * as synth from './synth.ts';
import { SCRATCH_TONES, type ClackKind, type Patch, type ScratchKind, type SwishKind } from './synth.ts';

export type SoundName = 'tick' | 'swish' | 'clack' | 'pop' | 'giggle' | 'tada' | 'scratch' | 'magic';

export interface SoundLogEntry {
  readonly name: SoundName;
  /** What it was for: a swish's kind, a giggle's band… */
  readonly detail: string;
  /** Which giggle or clip played, or −1. */
  readonly variant: number;
  /** Pitch factor (giggles), else 1. */
  readonly rate: number;
  /** False when muted or before the first gesture: asked for, but not heard. */
  readonly audible: boolean;
  readonly source: 'synth' | 'clip';
}

/** Giggles play at 0.8 with their pitch varied ±8% (PLAN.md). */
export const GIGGLE_LEVEL = 0.8;
export const GIGGLE_PITCH_RANGE = 0.08;
const MASTER_LEVEL = 0.9;
const LOG_SIZE = 200;
/** Recorded giggles are used once at least this many load; otherwise the synthesized ones. */
const MIN_GIGGLE_CLIPS = 2;

/**
 * The next giggle to play, out of `count`, never `last` again (when there's a choice).
 * Picks uniformly from the others; `random` returns a number in [0, 1).
 */
export function nextGiggle(count: number, last: number, random: () => number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.floor(random() * count);
  // Choose among the count − 1 others, then step over `last`.
  const pick = Math.floor(random() * (count - 1));
  return pick >= last ? pick + 1 : pick;
}

/** Recorded clips listed in public/sounds/sounds.json, paths relative to public/sounds/. */
export interface SoundManifest {
  readonly giggles: readonly string[];
  readonly tada: readonly string[];
}

export function parseSoundManifest(json: unknown): SoundManifest {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  return { giggles: list(o['giggles']), tada: list(o['tada']) };
}

/** Events that may carry a user gesture. Touch only counts on pointerup/touchend, mouse on pointerdown. */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

export class SoundEngine {
  /** Every sound asked for, newest last (for tests and tuning). */
  readonly log: SoundLogEntry[] = [];
  private ctx: AudioContext | null = null;
  private patch: Patch | null = null;
  private master: GainNode | null = null;
  private readonly scratches = new Map<ScratchKind, synth.Scratch>();
  private scratch: synth.Scratch | null = null;
  private muted: boolean;
  private listening = false;
  private lastGiggle = -1;
  private nextPopAt = 0;
  private giggleClips: AudioBuffer[] = [];
  private tadaClips: AudioBuffer[] = [];
  private readonly soundsDir: string;
  private readonly random: () => number;

  constructor(options: { muted: boolean; soundsDir: string; random?: () => number }) {
    this.muted = options.muted;
    this.soundsDir = options.soundsDir;
    this.random = options.random ?? Math.random;
  }

  /** The AudioContext's state, or 'none' before the first gesture. */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Recorded giggles in use (0 means the synthesized ones play). */
  get giggleClipCount(): number {
    return this.giggleClips.length;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    if (muted) this.scratchEnd();
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.015);
  }

  /** Wait for the first gesture; also re-unlock if iOS suspends or interrupts the context later. */
  listen(): void {
    if (this.listening) return;
    this.listening = true;
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, this.unlock, { capture: true, passive: true });
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, this.unlock, { capture: true });
  }

  private readonly unlock = (): void => {
    // Not a gesture yet (in Chrome, a touch pointerdown): creating the context now would leave it
    // suspended with a console warning, so wait for this touch's pointerup.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    const ctx = this.ctx ?? this.create();
    if (ctx.state === 'running') {
      this.stopListening();
      return;
    }
    ctx.resume().catch(() => undefined);
    // iOS: playing a silent sample inside the gesture wakes the audio output fully.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
  };

  private create(): AudioContext {
    // Mix with other audio and follow the ring/silent switch, like most iOS games.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    // A gentle limiter, so a giggle over a scratch and a pop never clips.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : MASTER_LEVEL;
    master.connect(limiter);
    this.ctx = ctx;
    this.master = master;
    this.patch = { ctx, out: master, noise: synth.pinkNoise(ctx) };
    ctx.addEventListener('statechange', () => {
      // iOS can suspend or 'interrupt' the context (a call, the app backgrounded); the next gesture resumes it.
      if (ctx.state === 'running') this.stopListening();
      else if (ctx.state !== 'closed') this.listen();
    });
    void this.loadClips();
    return ctx;
  }

  /** Recorded clips load after the first gesture, so they never slow the first paint. */
  private async loadClips(): Promise<void> {
    const ctx = this.ctx!;
    let manifest: SoundManifest;
    try {
      const res = await fetch(`${this.soundsDir}sounds.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = parseSoundManifest(await res.json());
    } catch (err) {
      console.warn('Vivi Fashion Dresses: no sound manifest; using synthesized giggles', err);
      return;
    }
    const load = async (files: readonly string[]): Promise<AudioBuffer[]> => {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const r = await fetch(this.soundsDir + file);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return ctx.decodeAudioData(await r.arrayBuffer());
        }),
      );
      return results.flatMap((r, i) => {
        if (r.status === 'fulfilled') return [r.value];
        console.warn(`Vivi Fashion Dresses: skipping sound "${files[i]}": ${String(r.reason)}`);
        return [];
      });
    };
    const [giggles, tada] = await Promise.all([load(manifest.giggles), load(manifest.tada)]);
    this.giggleClips = giggles.length >= MIN_GIGGLE_CLIPS ? giggles : [];
    this.tadaClips = tada;
  }

  /** Log a sound and, when it can be heard, schedule it a moment from now. */
  private play(name: SoundName, detail: string, fn: ((p: Patch, t: number) => void) | null, extra: Partial<SoundLogEntry> = {}): void {
    const audible = this.ctx?.state === 'running' && !this.muted;
    this.log.push({ name, detail, variant: -1, rate: 1, audible, source: 'synth', ...extra });
    if (this.log.length > LOG_SIZE) this.log.shift();
    if (audible && fn) fn(this.patch!, this.ctx!.currentTime + 0.005);
  }

  private clip(p: Patch, t: number, buffer: AudioBuffer, rate: number, level: number): void {
    const src = p.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = p.ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(p.out);
    src.start(t);
  }

  tick(): void {
    const pitch = 0.95 + this.random() * 0.1;
    this.play('tick', '', (p, t) => synth.tick(p, t, pitch));
  }

  swish(kind: SwishKind): void {
    this.play('swish', kind, (p, t) => synth.swish(p, t, kind));
  }

  clack(kind: ClackKind): void {
    this.play('clack', kind, (p, t) => synth.clack(p, t, kind));
  }

  /** A bead filled; `step` is how many of its group are now filled. Pops landing together are spaced out. */
  pop(step: number): void {
    this.play('pop', String(step), (p, t) => {
      const at = Math.max(t, this.nextPopAt);
      this.nextPopAt = at + 0.07;
      synth.pop(p, at, step);
    });
  }

  /** One giggle, never the same one twice in a row, pitch varied ±8%. */
  giggle(detail = ''): void {
    const clips = this.giggleClips;
    const count = clips.length > 0 ? clips.length : synth.GIGGLE_VOICES.length;
    const variant = nextGiggle(count, this.lastGiggle, this.random);
    this.lastGiggle = variant;
    const rate = 1 + (this.random() * 2 - 1) * GIGGLE_PITCH_RANGE;
    const source = clips.length > 0 ? 'clip' : 'synth';
    this.play(
      'giggle',
      detail,
      (p, t) => {
        if (source === 'clip') this.clip(p, t, clips[variant]!, rate, GIGGLE_LEVEL);
        else synth.giggle(p, t, synth.giggleScore(variant, rate), GIGGLE_LEVEL);
      },
      { variant, rate, source },
    );
  }

  /** The whole-outfit Ta-da: a longer giggle-and-cheer. */
  tada(): void {
    const clips = this.tadaClips;
    const variant = clips.length > 0 ? Math.floor(this.random() * clips.length) : -1;
    this.play(
      'tada',
      '',
      (p, t) => {
        if (variant >= 0) this.clip(p, t, clips[variant]!, 1, 0.9);
        else synth.tada(p, t);
      },
      { variant, source: variant >= 0 ? 'clip' : 'synth' },
    );
  }

  /** A Magic fill lands. */
  magic(): void {
    this.play('magic', '', (p, t) => synth.magic(p, t));
  }

  // ---------- Scratch, while rubbing, colouring or erasing ----------

  scratchStart(kind: ScratchKind = 'crayon'): void {
    this.play('scratch', kind, (p, t) => {
      let scratch = this.scratches.get(kind);
      if (!scratch) this.scratches.set(kind, (scratch = new synth.Scratch(p, SCRATCH_TONES[kind])));
      if (this.scratch !== scratch && this.scratch?.playing) this.scratch.stop(t);
      this.scratch = scratch;
      scratch.start(t);
    });
  }

  /** The stroke moved at `speed` sheet units per ms (called on every pointer move, so not logged). */
  scratchMove(speed: number): void {
    if (this.scratch?.playing && this.ctx) this.scratch.speed(speed, this.ctx.currentTime);
  }

  scratchEnd(): void {
    if (this.scratch?.playing && this.ctx) this.scratch.stop(this.ctx.currentTime);
  }
}
