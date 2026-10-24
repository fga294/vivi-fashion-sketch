import type { PlateBand, SlotBand } from './art/bands.ts';
import type { CrayonId, PencilId } from './art/colours.ts';
import { isFigure, PLATE_KINDS, type PlateArt, type PlateKind } from './art/plates.ts';

export type FigurePlate = PlateArt & { readonly band: PlateBand };

/** What sits in the frame: at most one plate per band, and a top plate excludes head and torso. */
export type Slots = Readonly<Partial<Record<PlateBand, FigurePlate>>>;

export interface Placement {
  readonly slots: Slots;
  /** Plates pushed out of the frame by this change. */
  readonly removed: readonly FigurePlate[];
}

/** Put a plate in its band. A top plate replaces head and torso; a head or torso replaces a top. */
export function placeInFrame(slots: Slots, plate: FigurePlate): Placement {
  const next: Partial<Record<PlateBand, FigurePlate>> = { ...slots };
  const removed: FigurePlate[] = [];
  const takeOut = (band: PlateBand): void => {
    const p = next[band];
    if (p && p.id !== plate.id) removed.push(p);
    delete next[band];
  };
  takeOut(plate.band);
  if (plate.band === 'top') {
    takeOut('head');
    takeOut('torso');
  } else if (plate.band === 'head' || plate.band === 'torso') {
    takeOut('top');
  }
  next[plate.band] = plate;
  return { slots: next, removed };
}

export function removeFromFrame(slots: Slots, band: PlateBand): Placement {
  const plate = slots[band];
  if (!plate) return { slots, removed: [] };
  const next = { ...slots };
  delete next[band];
  return { slots: next, removed: [plate] };
}

/**
 * The plate index after flipping a stack by `delta`. Flipping past the last
 * plate wraps to the first, like sliding the top plate under the pile.
 */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

// ---------- Event bus ----------

export interface GameEvents {
  'plate:flip': { readonly kind: PlateKind; readonly plate: PlateArt };
  'plate:place': { readonly plate: FigurePlate; readonly removed: readonly FigurePlate[] };
  'plate:remove': { readonly plate: FigurePlate };
  /** A plate starts sliding into the frame, or back to its well. */
  'plate:slide': { readonly to: 'frame' | 'tray' };
  /** Someone tried to change plates while the paper is down. */
  'plate:locked': Record<string, never>;
  /** Paper laid in the frame; `fresh` is false when laid back after a lift. */
  'paper:lay': { readonly fresh: boolean };
  'paper:lift': Record<string, never>;
  /** The frame's window closes over the laid paper. */
  'paper:clack': Record<string, never>;
  /** The sheet is cleared and taken out of the frame. */
  'paper:new': Record<string, never>;
  'tool:change': { readonly tool: Tool };
  /** A different rubbing crayon is chosen. */
  'crayon:change': { readonly crayon: CrayonId };
  /** A different colouring pencil is chosen. */
  'pencil:change': { readonly pencil: PencilId };
  /** Magic fill switched on or off: with it on, a pencil tap fills a closed area. */
  'magic:change': { readonly on: boolean };
  /** A Magic fill landed, covering this share of the sheet (0–1). */
  'fill:done': { readonly share: number };
  /** What Undo and Redo can do now. */
  'history:change': { readonly canUndo: boolean; readonly canRedo: boolean };
  /** An action was undone or redone. */
  'history:step': { readonly direction: 'undo' | 'redo' };
  /** A pattern plate is tucked under the frame (rubbing reveals it), or put away (null). */
  'pattern:change': { readonly plate: PlateArt | null; readonly previous: PlateArt | null };
  /** A plate's share of revealed line samples, 0–1. */
  'band:progress': { readonly band: PlateBand; readonly progress: number };
  /** A plate reached 90% and finishes itself. Once per band per paper placement. */
  'band:complete': { readonly band: PlateBand };
  /** Every band placed under this paper placement is complete. Once per placement. */
  'outfit:complete': Record<string, never>;
  /** A progress bead filled (at 30%, 60% or 90%); `count` is how many are now filled. */
  'bead:fill': { readonly band: SlotBand; readonly count: number };
}

/** What the pointer does on the paper. A pencil colours freehand, or fills a closed area with Magic fill on. */
export type Tool = 'none' | 'crayon' | 'pencil' | 'eraser';

type Handler<T> = (payload: T) => void;

export class Bus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const fn of this.handlers.get(type) ?? []) (fn as Handler<Events[K]>)(payload);
  }
}

// ---------- Game state ----------

/**
 * noPaper: choose plates. paperDown: rub, pattern, colour (plates locked).
 * paperLifted: swap plates while the sheet is kept.
 *
 *   noPaper --lay--> paperDown --lift--> paperLifted --lay--> paperDown
 *   any --new sheet--> noPaper
 */
export type Phase = 'noPaper' | 'paperDown' | 'paperLifted';

export class Game {
  readonly bus = new Bus<GameEvents>();
  readonly stacks: Readonly<Record<PlateKind, readonly PlateArt[]>>;
  private readonly tops: Record<PlateKind, number> = { head: 0, torso: 0, legs: 0, top: 0, pattern: 0 };
  private current: Slots = {};
  phase: Phase = 'noPaper';
  tool: Tool = 'none';
  crayon: CrayonId = 'wax';
  pencil: PencilId = 'cherry';
  /** Magic fill: a pencil tap fills the closed area under it. */
  magic = false;
  /** The active pattern plate: while set, the crayon reveals its texture instead of the figure's lines. */
  pattern: PlateArt | null = null;

  constructor(plates: readonly PlateArt[]) {
    const stacks = Object.fromEntries(PLATE_KINDS.map((k) => [k, [] as PlateArt[]])) as Record<PlateKind, PlateArt[]>;
    for (const p of plates) stacks[p.band].push(p);
    this.stacks = stacks;
  }

  get slots(): Slots {
    return this.current;
  }

  get canSwapPlates(): boolean {
    return this.phase !== 'paperDown';
  }

  indexOf(kind: PlateKind): number {
    return this.tops[kind];
  }

  topOf(kind: PlateKind): PlateArt | undefined {
    return this.stacks[kind][this.tops[kind]];
  }

  flip(kind: PlateKind, delta: number): PlateArt | undefined {
    const count = this.stacks[kind].length;
    if (count === 0) return undefined;
    this.tops[kind] = stepIndex(this.tops[kind], delta, count);
    const plate = this.topOf(kind)!;
    this.bus.emit('plate:flip', { kind, plate });
    return plate;
  }

  /** What placing this plate would push out, without changing anything. */
  preview(plate: FigurePlate): readonly FigurePlate[] {
    return placeInFrame(this.current, plate).removed;
  }

  place(plate: PlateArt): Placement | null {
    if (!this.canSwapPlates || !isFigure(plate)) return null;
    const result = placeInFrame(this.current, plate);
    this.current = result.slots;
    this.bus.emit('plate:place', { plate, removed: result.removed });
    return result;
  }

  /** Lay a fresh sheet, or lay the lifted sheet back in registration. */
  layPaper(): boolean {
    if (this.phase === 'paperDown') return false;
    const fresh = this.phase === 'noPaper';
    this.phase = 'paperDown';
    this.bus.emit('paper:lay', { fresh });
    return true;
  }

  /** Swing the paper up, keeping everything drawn, so plates can be swapped. */
  liftPaper(): boolean {
    if (this.phase !== 'paperDown') return false;
    this.phase = 'paperLifted';
    this.bus.emit('paper:lift', {});
    return true;
  }

  /** Take the sheet out of the frame and start again (saving to the sketchbook arrives in phase 8). */
  newSheet(): boolean {
    if (this.phase === 'noPaper') return false;
    this.phase = 'noPaper';
    this.bus.emit('paper:new', {});
    this.usePattern(null); // a fresh sheet starts with the figure's lines
    return true;
  }

  /**
   * Tuck a pattern plate under the frame, or put it away with null. Unlike figure
   * plates this works with the paper down: the plate slides in under the frame's edge.
   */
  usePattern(plate: PlateArt | null): boolean {
    if (plate && plate.band !== 'pattern') return false;
    const previous = this.pattern;
    if (plate?.id === previous?.id) return false;
    this.pattern = plate;
    this.bus.emit('pattern:change', { plate, previous });
    return true;
  }

  setCrayon(crayon: CrayonId): void {
    if (crayon === this.crayon) return;
    this.crayon = crayon;
    this.bus.emit('crayon:change', { crayon });
  }

  setPencil(pencil: PencilId): void {
    if (pencil === this.pencil) return;
    this.pencil = pencil;
    this.bus.emit('pencil:change', { pencil });
  }

  setMagic(on: boolean): void {
    if (on === this.magic) return;
    this.magic = on;
    this.bus.emit('magic:change', { on });
  }

  setTool(tool: Tool): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.bus.emit('tool:change', { tool });
  }

  remove(band: PlateBand): FigurePlate | undefined {
    if (!this.canSwapPlates) return undefined;
    const { slots, removed } = removeFromFrame(this.current, band);
    this.current = slots;
    const plate = removed[0];
    if (plate) this.bus.emit('plate:remove', { plate });
    return plate;
  }
}
