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
  for (const [cell, weight] of octaves) {
    const n = size / cell;
    const lattice = new Float32Array(n * n).map(() => rnd());
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % n;
      const y1 = (y0 + 1) % n;
      const fy = smooth(gy - Math.floor(gy));
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % n;
        const x1 = (x0 + 1) % n;
        const fx = smooth(gx - Math.floor(gx));
        const top = lattice[y0 * n + x0]! + (lattice[y0 * n + x1]! - lattice[y0 * n + x0]!) * fx;
        const bottom = lattice[y1 * n + x0]! + (lattice[y1 * n + x1]! - lattice[y1 * n + x0]!) * fx;
        out[y * size + x]! += weight * (top + (bottom - top) * fy);
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

/**
 * Map grain to wax coverage: the lowest ~12% of the field drops out entirely
 * (breaks in the line), the next ~28% is partial, the rest is solid wax.
 */
export function waxAlpha(field: Float32Array): Uint8ClampedArray {
  const sorted = Float32Array.from(field).sort();
  const lo = sorted[Math.floor(sorted.length * 0.12)]!;
  const hi = sorted[Math.floor(sorted.length * 0.4)]!;
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
