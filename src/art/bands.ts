import anatomy from './anatomy.json';

/** Bands that have a slot in the tracing frame. */
export type SlotBand = 'head' | 'torso' | 'legs';
/** Bands a figure plate can belong to; a top plate fills both head and torso. */
export type PlateBand = SlotBand | 'top';

export interface BandRange {
  readonly y0: number;
  readonly y1: number;
}

export const SHEET: { readonly width: number; readonly height: number } = anatomy.sheet;

export const BANDS: Readonly<Record<PlateBand, BandRange>> = anatomy.bands;

export const SLOT_BANDS: readonly SlotBand[] = ['head', 'torso', 'legs'];

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
