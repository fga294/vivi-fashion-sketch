import { bandViewBox, PATTERN_TILE, type PlateBand } from './bands.ts';
import { shapeToPathData } from './geometry.ts';
import { parseXml, walk, type XmlElement } from './svg.ts';

/** Every stack in the tray: the four figure bands plus pattern plates. */
export type PlateKind = PlateBand | 'pattern';

export const PLATE_KINDS: readonly PlateKind[] = ['head', 'torso', 'legs', 'top', 'pattern'];

/** One row of public/plates/plates.json. */
export interface PlateEntry {
  readonly id: string;
  readonly band: PlateKind;
  readonly name: string;
  /** Path relative to public/plates/. */
  readonly file: string;
}

/** A plate ready to draw: its manifest entry plus the geometry from its SVG. */
export interface PlateArt extends PlateEntry {
  readonly title: string;
  readonly viewBox: string;
  /** Path data for every shape, in absolute sheet (or tile) coordinates. */
  readonly paths: readonly string[];
  /**
   * The shapes that bound a garment or body part: every path except those marked
   * data-detail (pleats, stripes, pockets, buttons), which sit inside one area.
   * "Stay inside" keeps a pattern within these lines.
   */
  readonly outlines: readonly string[];
}

export function isFigure(plate: PlateEntry): plate is PlateEntry & { readonly band: PlateBand } {
  return plate.band !== 'pattern';
}

/** The viewBox every plate of this kind must use. */
export function expectedViewBox(kind: PlateKind): string {
  return kind === 'pattern' ? `0 0 ${PATTERN_TILE} ${PATTERN_TILE}` : bandViewBox(kind);
}

/** Validate and return the entries of plates.json. Throws with every problem listed. */
export function parseManifest(json: unknown): PlateEntry[] {
  const problems: string[] = [];
  const list = (json as { plates?: unknown } | null)?.plates;
  if (!Array.isArray(list)) throw new Error('plates.json must be an object with a "plates" array');

  const ids = new Set<string>();
  const entries: PlateEntry[] = [];
  list.forEach((raw: unknown, i) => {
    const e = raw as Partial<Record<keyof PlateEntry, unknown>>;
    const where = `plates[${i}]`;
    if (typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) problems.push(`${where}: id must be lower-case-kebab`);
    else if (ids.has(e.id)) problems.push(`${where}: duplicate id "${e.id}"`);
    if (typeof e.band !== 'string' || !(PLATE_KINDS as readonly string[]).includes(e.band)) {
      problems.push(`${where}: band must be one of ${PLATE_KINDS.join(', ')}`);
    }
    if (typeof e.name !== 'string' || e.name.trim() === '') problems.push(`${where}: name is required`);
    if (typeof e.file !== 'string' || !/^[a-z0-9/_-]+\.svg$/.test(e.file) || e.file.includes('..')) {
      problems.push(`${where}: file must be a relative .svg path inside public/plates/`);
    }
    if (typeof e.id === 'string') ids.add(e.id);
    entries.push(e as PlateEntry);
  });

  if (problems.length > 0) throw new Error(`plates.json is invalid:\n  ${problems.join('\n  ')}`);
  return entries;
}

/** Path data for every shape under an SVG root, in document order. */
export function shapesOf(root: XmlElement): string[] {
  return shapes(root).map((s) => s.d);
}

/** Every shape's path data, and whether it is marked as a detail inside an area. */
function shapes(root: XmlElement): { d: string; detail: boolean }[] {
  const out: { d: string; detail: boolean }[] = [];
  walk(root, (el) => {
    const d = shapeToPathData(el.name, el.attrs);
    if (d !== null) out.push({ d, detail: 'data-detail' in el.attrs });
  });
  return out;
}

export function artFromXml(entry: PlateEntry, root: XmlElement): PlateArt {
  const title = root.children.find((c) => c.name === 'title')?.text.trim() ?? '';
  const all = shapes(root);
  return {
    ...entry,
    title,
    viewBox: root.attrs['viewBox'] ?? '',
    paths: all.map((s) => s.d),
    outlines: all.filter((s) => !s.detail).map((s) => s.d),
  };
}

/** Read a plate SVG file into drawable art. */
export function readPlateSvg(entry: PlateEntry, svgText: string): PlateArt {
  return artFromXml(entry, parseXml(svgText));
}
