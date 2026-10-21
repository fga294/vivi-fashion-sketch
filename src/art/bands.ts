import anatomy from './anatomy.json' with { type: 'json' };

/** Bands that have a slot in the tracing frame. */
export type SlotBand = 'head' | 'torso' | 'legs';
/** Bands a figure plate can belong to; a top plate fills both head and torso. */
export type PlateBand = SlotBand | 'top';

export interface BandRange {
  readonly y0: number;
  readonly y1: number;
}

export interface Seam {
  readonly name: string;
  readonly y: number;
  /** x positions where connector lines must cross the seam. */
  readonly crossings: readonly number[];
  /** x positions where a connector line may cross the seam. */
  readonly optional: readonly number[];
}

export const SHEET: { readonly width: number; readonly height: number } = anatomy.sheet;

export const BANDS: Readonly<Record<PlateBand, BandRange>> = anatomy.bands;

export const SLOT_BANDS: readonly SlotBand[] = ['head', 'torso', 'legs'];

export const SEAMS: readonly Seam[] = anatomy.seams;

/** How far (units) a connector may sit from its anatomy x and still join. */
export const TOLERANCE: number = anatomy.tolerance;

/** Non-connector lines must stay at least this far (units) from a seam. */
export const CLEARANCE: number = anatomy.clearance;

/** Feet finish by maxY; below zoneY everything stays within minX–maxX. */
export const FEET: { readonly maxY: number; readonly minX: number; readonly maxX: number; readonly zoneY: number } =
  anatomy.feet;

/** Pattern art is one square tile of this many units. */
export const PATTERN_TILE: number = anatomy.patternTile;

/** Which bands a plate occupies in the frame. */
export function slotsFilledBy(band: PlateBand): readonly SlotBand[] {
  return band === 'top' ? ['head', 'torso'] : [band];
}

/** Seams on a band's edges. A top plate's internal neck seam is not one of its edges. */
export function seamsOf(band: PlateBand): readonly Seam[] {
  const { y0, y1 } = BANDS[band];
  return SEAMS.filter((s) => s.y === y0 || s.y === y1);
}

/** SVG viewBox for a band, in absolute sheet coordinates (see PLAN.md, SVG authoring rules). */
export function bandViewBox(band: PlateBand): string {
  const { y0, y1 } = BANDS[band];
  return `0 ${y0} ${SHEET.width} ${y1 - y0}`;
}

/** Width ÷ height of a band's plate. */
export function bandAspect(band: PlateBand): number {
  const { y0, y1 } = BANDS[band];
  return SHEET.width / (y1 - y0);
}
