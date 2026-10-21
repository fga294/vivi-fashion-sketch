import { describe, expect, it } from 'vitest';
import { bandViewBox, type SlotBand } from '../../src/art/bands.ts';
import { GUIDE_ART } from '../../src/art/guide.ts';
import type { PlateEntry, PlateKind } from '../../src/art/plates.ts';
import { checkJoins, validatePlate } from '../../src/art/validate.ts';

const viewBoxOf = (band: PlateKind): string => (band === 'pattern' ? '0 0 120 120' : bandViewBox(band));

function plate(band: PlateKind, body: string, extra = ''): [PlateEntry, string] {
  const entry: PlateEntry = { id: `t-${band}`, band, name: 'Test', file: `t/${band}.svg` };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxOf(band)}" data-band="${band}" data-name="Test"
    fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${extra}>
    <title>Test</title>${body}</svg>`;
  return [entry, svg];
}

const errorsOf = (band: PlateKind, body: string, extra = ''): string[] => validatePlate(...plate(band, body, extra)).errors;

const NECK = '<path d="M282 190 L282 250"/><path d="M318 190 L318 250"/>';
const FACE = '<circle cx="300" cy="120" r="60"/>';

describe('validatePlate: figure plates', () => {
  it('accepts a head with both neck connectors', () => {
    expect(errorsOf('head', FACE + NECK)).toEqual([]);
  });

  it('flags a connector more than 1.5 units off', () => {
    const errors = errorsOf('head', FACE + '<path d="M284 190 L284 250"/><path d="M318 190 L318 250"/>');
    expect(errors.join()).toMatch(/connector at x=284 is 2 off x=282/);
  });

  it('flags a missing connector', () => {
    expect(errorsOf('head', FACE + '<path d="M318 190 L318 250"/>').join()).toMatch(/missing the connector at x=282/);
  });

  it('flags hair that crosses the seam', () => {
    expect(errorsOf('head', FACE + NECK + '<path d="M240 120 L240 250"/>').join()).toMatch(/extra line crosses at x=240/);
  });

  it('flags lines that stop just short of the seam', () => {
    expect(errorsOf('head', FACE + NECK + '<path d="M240 120 L240 248.5"/>').join()).toMatch(/within 3 units of the neck seam/);
  });

  it('flags lines that leave the plate', () => {
    expect(errorsOf('head', FACE + NECK + '<path d="M300 40 L300 -5"/>').join()).toMatch(/leaves the plate/);
  });

  it('allows the optional centre-front line at the waist, and checks it too', () => {
    const torso = '<path d="M282 250 L282 270"/><path d="M318 250 L318 270"/><path d="M258 300 L258 570"/><path d="M342 300 L342 570"/>';
    expect(errorsOf('torso', torso + '<path d="M300 400 L300 570"/>')).toEqual([]);
    expect(errorsOf('torso', torso + '<path d="M303 400 L303 570"/>').join()).toMatch(/is 3 off x=300/);
  });

  it('only checks the waist seam on top plates', () => {
    expect(errorsOf('top', FACE + '<path d="M240 100 L240 300"/><path d="M258 300 L258 570"/><path d="M342 300 L342 570"/>')).toEqual([]);
  });

  it('keeps feet above y=1470 and inside x=210–390', () => {
    const waist = '<path d="M258 570 L258 600"/><path d="M342 570 L342 600"/>';
    expect(errorsOf('legs', waist + '<path d="M260 1400 L260 1480"/>').join()).toMatch(/must finish by y=1470/);
    expect(errorsOf('legs', waist + '<path d="M200 1420 L240 1420"/>').join()).toMatch(/x=210–390/);
  });

  it('enforces strokes-only authoring rules', () => {
    expect(errorsOf('head', FACE + NECK + '<path d="M290 100 L310 100" fill="red"/>').join()).toMatch(/has a fill/);
    expect(errorsOf('head', FACE + NECK + '<path d="M290 100 L310 100" stroke-width="5"/>').join()).toMatch(/stroke-width/);
    expect(errorsOf('head', FACE + NECK + '<g transform="translate(1 0)"/>').join()).toMatch(/transform/);
    expect(errorsOf('head', FACE + NECK + '<text>x</text>').join()).toMatch(/<text> is not allowed/);
  });

  it('checks the viewBox, data attributes and title', () => {
    const [entry, svg] = plate('head', FACE + NECK);
    expect(validatePlate(entry, svg.replace('0 0 600 250', '0 0 600 300')).errors.join()).toMatch(/viewBox/);
    expect(validatePlate(entry, svg.replace('data-name="Test"', 'data-name="Other"')).errors.join()).toMatch(/data-name/);
    expect(validatePlate(entry, svg.replace('<title>Test</title>', '')).errors.join()).toMatch(/title/);
  });
});

describe('validatePlate: pattern tiles', () => {
  it('accepts a tile whose lines wrap edge to edge', () => {
    expect(errorsOf('pattern', '<path d="M20 0 L20 120"/><path d="M0 60 L120 60"/><circle cx="60" cy="30" r="8"/>')).toEqual([]);
  });

  it('flags a line that does not continue on the opposite edge', () => {
    expect(errorsOf('pattern', '<path d="M20 0 L40 60"/>').join()).toMatch(/does not wrap/);
  });
});

describe('checkJoins', () => {
  it('flags two plates that each pass but meet more than 1.5 units apart', () => {
    const head = validatePlate(...plate('head', FACE + '<path d="M280.6 190 L280.6 250"/><path d="M318 190 L318 250"/>'));
    const torso = validatePlate(
      ...plate('torso', '<path d="M283.4 250 L283.4 270"/><path d="M318 250 L318 270"/><path d="M258 300 L258 570"/><path d="M342 300 L342 570"/>'),
    );
    expect(head.errors).toEqual([]);
    expect(torso.errors).toEqual([]);
    expect(checkJoins([head, torso]).join()).toMatch(/2.8 units apart/);
  });
});

describe('frame guide figure', () => {
  it.each(['head', 'torso', 'legs'] as SlotBand[])('the %s guide follows the seam rules', (band) => {
    const body = GUIDE_ART[band].map((d) => `<path d="${d}"/>`).join('');
    expect(errorsOf(band, body)).toEqual([]);
  });
});
