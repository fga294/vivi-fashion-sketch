// Synthesized sounds. Each voice is a small Web Audio graph scheduled at a start
// time on any BaseAudioContext, so tests can render them offline. Voices keep no
// state between calls except the scratch, which follows the pointer while it rubs.
// The engine in sound.ts owns the context, the master bus and the timing.

import { mulberry32 } from '../engine/random.ts';

/** Where a voice plays: the context, the bus it connects to, and shared looping noise. */
export interface Patch {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
  readonly noise: AudioBuffer;
}

/** Pink noise (Paul Kellet's filter), crossfaded end to start so it loops without a click. */
export function pinkNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.05);
  const raw = new Float32Array(n + fade);
  const rnd = mulberry32(7);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  d.set(raw.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i]! * k + raw[n + i]! * (1 - k);
  }
  return buf;
}

function noiseSource(p: Patch, t: number, length: number): AudioBufferSourceNode {
  const src = p.ctx.createBufferSource();
  src.buffer = p.noise;
  src.loop = true;
  src.start(t, Math.random() * p.noise.duration);
  src.stop(t + length);
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** A gain that rises to `peak` in `attack` s, then decays to near silence over about `decay` s. */
function envelope(ctx: BaseAudioContext, t: number, attack: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 3);
  return g;
}

function tone(p: Patch, t: number, type: OscillatorType, from: number, to: number, glide: number, gain: GainNode, length: number): void {
  const o = p.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + glide);
  o.connect(gain).connect(p.out);
  o.start(t);
  o.stop(t + length);
}

function burst(p: Patch, t: number, type: BiquadFilterType, frequency: number, q: number, peak: number, decay: number): void {
  noiseSource(p, t, decay * 2 + 0.02)
    .connect(filter(p.ctx, type, frequency, q))
    .connect(envelope(p.ctx, t, 0.001, peak, decay))
    .connect(p.out);
}

// ---------- Tray sounds ----------

/** Plate flip: a plastic card flicked over. A tiny snap and a short high tock. */
export function tick(p: Patch, t: number, pitch = 1): void {
  tone(p, t, 'triangle', 1500 * pitch, 1050 * pitch, 0.03, envelope(p.ctx, t, 0.002, 0.2, 0.04), 0.12);
  burst(p, t, 'highpass', 3500, 0.7, 0.12, 0.012);
}

export type SwishKind = 'plate' | 'home' | 'paper';

const SWISHES: Record<SwishKind, { readonly from: number; readonly to: number; readonly length: number; readonly peak: number }> = {
  plate: { from: 500, to: 1400, length: 0.3, peak: 0.14 }, // plastic sliding into the frame
  home: { from: 1300, to: 550, length: 0.3, peak: 0.09 }, // sliding back to its well, softer
  paper: { from: 900, to: 2600, length: 0.42, peak: 0.16 }, // airy paper
};

/** A filtered noise swish: something sliding across the tray. */
export function swish(p: Patch, t: number, kind: SwishKind): void {
  const s = SWISHES[kind];
  const f = filter(p.ctx, 'bandpass', s.from, 0.9);
  f.frequency.setValueAtTime(s.from, t);
  f.frequency.exponentialRampToValueAtTime(s.to, t + s.length);
  const g = p.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(s.peak, t + s.length * 0.55);
  g.gain.linearRampToValueAtTime(0, t + s.length);
  noiseSource(p, t, s.length + 0.02).connect(f).connect(g).connect(p.out);
}

export type ClackKind = 'plate' | 'paper' | 'latch';

const CLACKS: Record<ClackKind, { readonly thump: number; readonly body: number; readonly level: number }> = {
  plate: { thump: 230, body: 1150, level: 0.7 }, // a plate seating in its band
  paper: { thump: 150, body: 720, level: 1 }, // the frame's window closing over the paper
  latch: { thump: 0, body: 1350, level: 0.55 }, // the window unlatching to lift
};

/** A molded-plastic clack: a low thump, a short hollow body tone and a click. */
export function clack(p: Patch, t: number, kind: ClackKind): void {
  const c = CLACKS[kind];
  if (c.thump > 0) tone(p, t, 'sine', c.thump, c.thump * 0.5, 0.06, envelope(p.ctx, t, 0.002, 0.4 * c.level, 0.08), 0.2);
  tone(p, t, 'triangle', c.body, c.body * 0.92, 0.04, envelope(p.ctx, t, 0.001, 0.16 * c.level, 0.05), 0.12);
  burst(p, t, 'bandpass', 2400, 1.5, 0.3 * c.level, 0.015);
}

/** Bead pop: a short sine blip that drops onto its note. Each bead in a group sounds higher. */
export function pop(p: Patch, t: number, step: number): void {
  const f = [660, 784, 988][Math.min(2, Math.max(0, step - 1))]!;
  tone(p, t, 'sine', f * 1.8, f, 0.03, envelope(p.ctx, t, 0.003, 0.22, 0.09), 0.2);
}

// ---------- Scratch ----------

export interface ScratchTone {
  /** Band-pass edges, Hz. */
  readonly low: number;
  readonly high: number;
  /** Gain at full speed. */
  readonly gain: number;
  /** Filter wobble depth, Hz. */
  readonly wobble: number;
}

/** Wax crayon on paper: pink noise through 1.8–3 kHz. */
export const CRAYON_SCRATCH: ScratchTone = { low: 1800, high: 3000, gain: 0.3, wobble: 140 };
/** Coloured pencil: a higher, quieter band. */
export const PENCIL_SCRATCH: ScratchTone = { low: 3200, high: 5200, gain: 0.15, wobble: 200 };
/** Eraser: a low, soft rubbery shuffle. */
export const ERASER_SCRATCH: ScratchTone = { low: 500, high: 1300, gain: 0.26, wobble: 80 };

export type ScratchKind = 'crayon' | 'pencil' | 'eraser';
export const SCRATCH_TONES: Readonly<Record<ScratchKind, ScratchTone>> = {
  crayon: CRAYON_SCRATCH,
  pencil: PENCIL_SCRATCH,
  eraser: ERASER_SCRATCH,
};

/** Stroke speed (sheet units per ms) at which the scratch is at full volume. */
export const SCRATCH_FULL_SPEED = 1.6;

/**
 * A looping scratch whose volume follows the pointer's speed. Each move sets the
 * level and schedules a fade to silence shortly after, so a pointer held still
 * goes quiet by itself, with no per-frame work on the main thread.
 */
export class Scratch {
  private readonly p: Patch;
  private readonly tone: ScratchTone;
  private readonly centre: number;
  private readonly band: BiquadFilterNode;
  private readonly gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;

  constructor(p: Patch, tone: ScratchTone) {
    this.p = p;
    this.tone = tone;
    this.centre = Math.sqrt(tone.low * tone.high);
    this.band = filter(p.ctx, 'bandpass', this.centre, this.centre / (tone.high - tone.low));
    this.gain = p.ctx.createGain();
    this.gain.gain.value = 0;
    this.band.connect(this.gain).connect(p.out);
  }

  get playing(): boolean {
    return this.src !== null;
  }

  start(t: number): void {
    if (this.src) return;
    const ctx = this.p.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.p.noise;
    src.loop = true;
    src.connect(this.band);
    src.start(t, Math.random() * this.p.noise.duration);
    // A slight wobble of the filter, a little different on every stroke.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 3;
    const depth = ctx.createGain();
    depth.gain.value = this.tone.wobble;
    lfo.connect(depth).connect(this.band.frequency);
    lfo.start(t);
    this.src = src;
    this.lfo = lfo;
  }

  /** The pointer moved at `speed` sheet units per ms. */
  speed(speed: number, t: number): void {
    if (!this.src) return;
    const k = Math.min(1, Math.max(0, speed / SCRATCH_FULL_SPEED));
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.tone.gain * Math.pow(k, 0.7), t, 0.02);
    g.setTargetAtTime(0, t + 0.08, 0.05);
    // Faster strokes sound a little brighter.
    this.band.frequency.setTargetAtTime(this.centre * (1 + 0.15 * k), t, 0.05);
  }

  stop(t: number): void {
    if (!this.src) return;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.03);
    this.src.stop(t + 0.25);
    this.lfo?.stop(t + 0.25);
    this.src = null;
    this.lfo = null;
  }
}

// ---------- Giggles ----------

/** PLAN.md: 70 ms blips with 40 ms gaps. */
export const BLIP = 0.07;
export const GAP = 0.04;

export interface Blip {
  /** Start, seconds from the giggle's start. */
  readonly t: number;
  readonly dur: number;
  /** Pitch at the blip's start and end, Hz. */
  readonly f0: number;
  readonly f1: number;
  readonly amp: number;
}

export interface GiggleScore {
  readonly blips: readonly Blip[];
  /** Formant filter centres, Hz. */
  readonly formants: readonly [number, number];
  readonly vibrato: number;
  /** Seconds. */
  readonly length: number;
}

interface GiggleVoice {
  /** Pitch of the first and last blip, Hz. */
  readonly from: number;
  readonly to: number;
  /** Shape of the fall: below 1 drops early, above 1 holds then drops. */
  readonly curve: number;
  /** One loudness per blip (5–7 blips). */
  readonly amps: readonly number[];
  readonly formants: readonly [number, number];
  readonly vibrato: number;
}

/** Four distinct "hee-hee"s, so the fallback never sounds like one clip on repeat. */
export const GIGGLE_VOICES: readonly GiggleVoice[] = [
  { from: 520, to: 420, curve: 1, amps: [1, 0.92, 0.85, 0.78, 0.7], formants: [1000, 2500], vibrato: 6.5 },
  { from: 530, to: 425, curve: 0.7, amps: [0.8, 1, 0.9, 0.84, 0.74, 0.64], formants: [1060, 2600], vibrato: 7.2 },
  { from: 515, to: 415, curve: 1.3, amps: [1, 0.86, 0.9, 0.8, 0.76, 0.7, 0.6], formants: [960, 2420], vibrato: 5.8 },
  { from: 545, to: 420, curve: 0.55, amps: [1, 0.78, 0.8, 0.74, 0.68, 0.6], formants: [1020, 2550], vibrato: 6.8 },
];

/**
 * The notes of one fallback giggle: 5–7 blips, pitch falling from about 520 Hz
 * to 420 Hz, each "hee" lifting a little at its start. `rate` scales the pitch
 * (±8% per giggle) but not the timing or the formants.
 */
export function giggleScore(voice: number, rate = 1): GiggleScore {
  const v = GIGGLE_VOICES[((voice % GIGGLE_VOICES.length) + GIGGLE_VOICES.length) % GIGGLE_VOICES.length]!;
  const n = v.amps.length;
  const blips = v.amps.map((amp, i) => {
    const f = v.from + (v.to - v.from) * Math.pow(i / (n - 1), v.curve);
    return { t: i * (BLIP + GAP), dur: BLIP, f0: f * 1.03 * rate, f1: f * 0.98 * rate, amp };
  });
  return { blips, formants: v.formants, vibrato: v.vibrato, length: (n - 1) * (BLIP + GAP) + BLIP };
}

/**
 * Play a giggle: a sawtooth through formant filters near 1 kHz and 2.5 kHz, with
 * light vibrato and a breathy "h" at the start of each blip. Returns its end time.
 */
export function giggle(p: Patch, t: number, score: GiggleScore, level = 0.8): number {
  const { ctx } = p;
  const end = t + score.length + 0.03;
  const mix = ctx.createGain();
  mix.gain.value = level;
  mix.connect(p.out);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const vib = ctx.createOscillator();
  vib.frequency.value = score.vibrato;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = (score.blips[0]?.f0 ?? 500) * 0.012;
  vib.connect(vibDepth).connect(osc.frequency);

  const voiced = ctx.createGain();
  voiced.gain.value = 0;
  osc.connect(voiced);
  const [f1, f2] = score.formants;
  const formant = (frequency: number, q: number, gain: number): void => {
    const g = ctx.createGain();
    g.gain.value = gain;
    voiced.connect(filter(ctx, 'bandpass', frequency, q)).connect(g).connect(mix);
  };
  formant(f1, 5, 1.5);
  formant(f2, 7, 2);

  const breath = ctx.createGain();
  breath.gain.value = 0;
  noiseSource(p, t, score.length + 0.05).connect(filter(ctx, 'bandpass', 2200, 1)).connect(breath).connect(mix);

  for (const b of score.blips) {
    const s = t + b.t;
    osc.frequency.setValueAtTime(b.f0, s);
    osc.frequency.exponentialRampToValueAtTime(b.f1, s + b.dur);
    const v = voiced.gain;
    v.setValueAtTime(0, s);
    v.linearRampToValueAtTime(b.amp, s + 0.012);
    v.linearRampToValueAtTime(b.amp * 0.85, s + b.dur - 0.02);
    v.linearRampToValueAtTime(0, s + b.dur);
    const h = breath.gain;
    h.setValueAtTime(0, s);
    h.linearRampToValueAtTime(b.amp * 0.4, s + 0.006);
    h.linearRampToValueAtTime(b.amp * 0.05, s + 0.03);
    h.linearRampToValueAtTime(0, s + b.dur);
  }
  osc.start(t);
  vib.start(t);
  osc.stop(end);
  vib.stop(end);
  return end;
}

// ---------- Ta-da ----------

/** A soft toy-piano chord: triangle and a little square per note, through a low-pass. */
function chord(p: Patch, t: number, notes: readonly number[], length: number, level: number): void {
  const lp = filter(p.ctx, 'lowpass', 3600, 0.5);
  const g = envelope(p.ctx, t, 0.012, level / notes.length, length);
  lp.connect(g).connect(p.out);
  for (const f of notes) {
    for (const [type, gain] of [['triangle', 1], ['square', 0.18]] as const) {
      const o = p.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = p.ctx.createGain();
      og.gain.value = gain;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + length * 1.5 + 0.05);
    }
  }
}

/** A sung "yay": a gliding sawtooth whose formants move from "ya" to "ay". */
function yay(p: Patch, t: number, level: number): number {
  const { ctx } = p;
  const length = 0.5;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(560, t + 0.13);
  osc.frequency.exponentialRampToValueAtTime(500, t + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.04);
  env.gain.setValueAtTime(level, t + length - 0.16);
  env.gain.linearRampToValueAtTime(0, t + length);
  env.connect(p.out);
  const move = (from: number, to: number, q: number, gain: number): void => {
    const f = filter(ctx, 'bandpass', from, q);
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + 0.35);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(f).connect(g).connect(env);
  };
  move(850, 450, 5, 1.6);
  move(1500, 2600, 7, 2);
  osc.start(t);
  osc.stop(t + length + 0.02);
  return t + length;
}

/** The synthesized Ta-da: "ta" and a held "da!" chord with sparkles, a giggle, and a cheer. */
export function tada(p: Patch, t: number, level = 0.9): number {
  chord(p, t, [392, 523.25, 659.25], 0.12, 0.5 * level); // G4 C5 E5
  chord(p, t + 0.16, [523.25, 659.25, 783.99, 1046.5], 0.9, 0.6 * level); // C5 E5 G5 C6
  [2093, 2637.02, 3135.96, 4186.01].forEach((f, i) => {
    const s = t + 0.3 + i * 0.11;
    tone(p, s, 'sine', f, f, 0, envelope(p.ctx, s, 0.002, 0.07 * level, 0.25), 0.4); // glockenspiel pings
  });
  const end = giggle(p, t + 0.75, giggleScore(2, 1.06), 0.7 * level);
  return yay(p, end + 0.02, 0.5 * level);
}

/** Magic fill: a soft shimmer of noise under a quick rising glockenspiel run. */
export function magic(p: Patch, t: number, level = 0.7): void {
  burst(p, t, 'highpass', 5200, 0.7, 0.05 * level, 0.35);
  [1567.98, 2093, 2637.02, 3135.96, 4186.01].forEach((f, i) => {
    const s = t + i * 0.055;
    tone(p, s, 'sine', f, f, 0, envelope(p.ctx, s, 0.002, 0.06 * level, 0.22), 0.3);
  });
}
