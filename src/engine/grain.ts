// The 256 × 256 tileable grain behind every waxy mark: line reveals, haze, crayon
// edges and paper tooth all sample it, so the sheet reads as one material.

import { mulberry32 } from './random.ts';

export const GRAIN_SIZE = 256;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Tileable value noise in [0, 1]: octaves of random lattices whose periods divide
 * the texture size, so the right edge continues into the left and the bottom into the top.
 */
export function grainField(size = GRAIN_SIZE, seed = 7): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  const octaves: readonly [cell: number, weight: number][] = [
    [64, 0.22],
    [16, 0.24],
    [8, 0.22],
    [4, 0.18],
    [2, 0.14],
  ];
  // Each column's lattice cells and blend are the same on every row: work them out once.
  const c0 = new Int32Array(size);
  const c1 = new Int32Array(size);
  const cf = new Float32Array(size);
  for (const [cell, weight] of octaves) {
    const n = size / cell;
    const lattice = new Float32Array(n * n).map(() => rnd());
    for (let x = 0; x < size; x++) {
      const gx = x / cell;
      c0[x] = Math.floor(gx) % n;
      c1[x] = (c0[x]! + 1) % n;
      cf[x] = smooth(gx - Math.floor(gx));
    }
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const top0 = (Math.floor(gy) % n) * n;
      const bottom0 = (((Math.floor(gy) % n) + 1) % n) * n;
      const fy = smooth(gy - Math.floor(gy));
      for (let x = 0, i = y * size; x < size; x++, i++) {
        const fx = cf[x]!;
        const a = lattice[top0 + c0[x]!]!;
        const b = lattice[top0 + c1[x]!]!;
        const c = lattice[bottom0 + c0[x]!]!;
        const d = lattice[bottom0 + c1[x]!]!;
        const top = a + (b - a) * fx;
        const bottom = c + (d - c) * fx;
        out[i]! += weight * (top + (bottom - top) * fy);
      }
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! - min) / (max - min);
  return out;
}

/** The values below which shares `qs` of a [0, 1] field fall, from a fine histogram (no sorting). */
export function quantiles(field: Float32Array, qs: readonly number[]): number[] {
  const BINS = 4096;
  const counts = new Uint32Array(BINS);
  for (const v of field) counts[Math.min(BINS - 1, Math.floor(v * BINS))]!++;
  return qs.map((q) => {
    const target = q * field.length;
    let seen = 0;
    for (let b = 0; b < BINS; b++) {
      seen += counts[b]!;
      if (seen > target) return (b + 0.5) / BINS;
    }
    return 1;
  });
}

/**
 * Map grain to wax coverage: the lowest ~12% of the field drops out entirely
 * (breaks in the line), the next ~28% is partial, the rest is solid wax.
 */
export function waxAlpha(field: Float32Array): Uint8ClampedArray {
  const [lo, hi] = quantiles(field, [0.12, 0.4]) as [number, number];
  const out = new Uint8ClampedArray(field.length);
  for (let i = 0; i < field.length; i++) {
    const t = Math.min(1, Math.max(0, (field[i]! - lo) / (hi - lo)));
    out[i] = Math.round(smooth(t) * 255);
  }
  return out;
}

/** A canvas holding the grain as black with wax alpha, for patterns and masks. */
export function grainCanvas(alpha: Uint8ClampedArray, size = GRAIN_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < alpha.length; i++) img.data[i * 4 + 3] = alpha[i]!;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Map grain to paper tooth for coloured pencil: the pencil catches the peaks, so
 * the lowest ~18% of the field takes no colour and the next ~40% only some.
 * Rubbing again builds colour on the peaks, as with a real pencil.
 */
export function toothAlpha(field: Float32Array): Uint8ClampedArray {
  const [lo, hi] = quantiles(field, [0.18, 0.58]) as [number, number];
  const out = new Uint8ClampedArray(field.length);
  for (let i = 0; i < field.length; i++) {
    const t = Math.min(1, Math.max(0, (field[i]! - lo) / (hi - lo)));
    out[i] = Math.round((0.25 + 0.75 * smooth(t)) * (t > 0 ? 255 : 0));
  }
  return out;
}
