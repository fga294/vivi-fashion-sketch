// SVG path geometry without a DOM: parse path data into absolute line and cubic
// segments, convert basic shapes to path data, and flatten to polylines. Shared by
// the plate validator (Node) and the loader (browser) so both measure plates the
// same way.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A straight line when c1/c2 are absent, otherwise a cubic Bézier. */
export interface Segment {
  readonly from: Point;
  readonly to: Point;
  readonly c1?: Point;
  readonly c2?: Point;
}

export interface Subpath {
  readonly segments: readonly Segment[];
  readonly closed: boolean;
}

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

class PathReader {
  readonly src: string;
  i = 0;

  constructor(src: string) {
    this.src = src;
  }

  skipSeparators(): void {
    while (this.i < this.src.length && /[\s,]/.test(this.src[this.i]!)) this.i++;
  }

  atEnd(): boolean {
    this.skipSeparators();
    return this.i >= this.src.length;
  }

  peekIsCommand(): boolean {
    this.skipSeparators();
    return /[A-Za-z]/.test(this.src[this.i] ?? '');
  }

  command(): string {
    this.skipSeparators();
    const c = this.src[this.i]!;
    if (!(c.toUpperCase() in ARG_COUNT)) throw new Error(`Unknown path command "${c}" at ${this.i}`);
    this.i++;
    return c;
  }

  number(): number {
    this.skipSeparators();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.src.slice(this.i));
    if (!m) throw new Error(`Expected a number at ${this.i} in path data`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  /** Arc flags may be written without separators ("a5 5 0 016 0"). */
  flag(): boolean {
    this.skipSeparators();
    const c = this.src[this.i];
    if (c !== '0' && c !== '1') throw new Error(`Expected an arc flag at ${this.i} in path data`);
    this.i++;
    return c === '1';
  }
}

const reflect = (p: Point, about: Point): Point => ({ x: 2 * about.x - p.x, y: 2 * about.y - p.y });

/** Endpoint-parameterised SVG arc → cubic Béziers of at most 90° each (SVG 1.1, F.6.5). */
function arcToCubics(
  p0: Point,
  rxIn: number,
  ryIn: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p: Point,
): Segment[] {
  if (p0.x === p.x && p0.y === p.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ from: p0, to: p }];

  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p.x) / 2;
  const dy = (p0.y - p.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dTheta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const delta = dTheta / n;
  const k = (4 / 3) * Math.tan(delta / 4);
  const at = (t: number): Point => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const tangent = (t: number): Point => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });

  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const t1 = theta1 + i * delta;
    const t2 = t1 + delta;
    const a = i === 0 ? p0 : at(t1);
    const b = i === n - 1 ? p : at(t2);
    const d1 = tangent(t1);
    const d2 = tangent(t2);
    segments.push({
      from: a,
      to: b,
      c1: { x: a.x + k * d1.x, y: a.y + k * d1.y },
      c2: { x: b.x - k * d2.x, y: b.y - k * d2.y },
    });
  }
  return segments;
}

/** Parse SVG path data into subpaths of absolute line and cubic segments. */
export function parsePath(d: string): Subpath[] {
  const r = new PathReader(d);
  const subpaths: Subpath[] = [];
  let segments: Segment[] = [];
  let cur: Point = { x: 0, y: 0 };
  let start: Point = cur;
  let lastC2: Point | null = null;
  let lastQ: Point | null = null;
  let cmd = '';

  const flush = (closed: boolean): void => {
    if (segments.length > 0) subpaths.push({ segments, closed });
    segments = [];
  };
  const point = (rel: boolean): Point => {
    const x = r.number();
    const y = r.number();
    return rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
  };

  while (!r.atEnd()) {
    if (r.peekIsCommand()) cmd = r.command();
    else if (cmd === '' || cmd.toUpperCase() === 'Z') throw new Error('Path data must start each run with a command');

    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    let nextC2: Point | null = null;
    let nextQ: Point | null = null;

    switch (upper) {
      case 'M': {
        flush(false);
        cur = start = point(rel);
        cmd = rel ? 'l' : 'L'; // further pairs are implicit line-tos
        break;
      }
      case 'L': {
        const p = point(rel);
        segments.push({ from: cur, to: p });
        cur = p;
        break;
      }
      case 'H': {
        const x = r.number();
        const p = { x: rel ? cur.x + x : x, y: cur.y };
        segments.push({ from: cur, to: p });
        cur = p;
        break;
      }
      case 'V': {
        const y = r.number();
        const p = { x: cur.x, y: rel ? cur.y + y : y };
        segments.push({ from: cur, to: p });
        cur = p;
        break;
      }
      case 'C': {
        const c1 = point(rel);
        const c2 = point(rel);
        const p = point(rel);
        segments.push({ from: cur, c1, c2, to: p });
        nextC2 = c2;
        cur = p;
        break;
      }
      case 'S': {
        const c1 = lastC2 ? reflect(lastC2, cur) : cur;
        const c2 = point(rel);
        const p = point(rel);
        segments.push({ from: cur, c1, c2, to: p });
        nextC2 = c2;
        cur = p;
        break;
      }
      case 'Q':
      case 'T': {
        const q: Point = upper === 'Q' ? point(rel) : lastQ ? reflect(lastQ, cur) : cur;
        const p = point(rel);
        segments.push({
          from: cur,
          c1: { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
          c2: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) },
          to: p,
        });
        nextQ = q;
        cur = p;
        break;
      }
      case 'A': {
        const rx = r.number();
        const ry = r.number();
        const rot = r.number();
        const large = r.flag();
        const sweep = r.flag();
        const p = point(rel);
        segments.push(...arcToCubics(cur, rx, ry, rot, large, sweep, p));
        cur = p;
        break;
      }
      case 'Z': {
        if (cur.x !== start.x || cur.y !== start.y) segments.push({ from: cur, to: start });
        flush(true);
        cur = start;
        break;
      }
    }
    lastC2 = nextC2;
    lastQ = nextQ;
  }
  flush(false);
  return subpaths;
}

const num = (attrs: Readonly<Record<string, string>>, key: string): number => {
  const v = Number(attrs[key] ?? 0);
  if (!Number.isFinite(v)) throw new Error(`Attribute ${key}="${attrs[key]}" is not a number`);
  return v;
};

const pointList = (raw: string): string => {
  const n = raw.trim().split(/[\s,]+/).map(Number);
  if (n.length < 4 || n.length % 2 !== 0 || n.some((v) => !Number.isFinite(v))) {
    throw new Error(`Bad points list "${raw}"`);
  }
  const pairs: string[] = [];
  for (let i = 0; i < n.length; i += 2) pairs.push(`${n[i]} ${n[i + 1]}`);
  return `M${pairs.join(' L')}`;
};

/** Path data for an SVG shape element, or null if the element is not a shape. */
export function shapeToPathData(tag: string, attrs: Readonly<Record<string, string>>): string | null {
  switch (tag) {
    case 'path':
      return attrs['d'] ?? '';
    case 'line':
      return `M${num(attrs, 'x1')} ${num(attrs, 'y1')} L${num(attrs, 'x2')} ${num(attrs, 'y2')}`;
    case 'polyline':
      return pointList(attrs['points'] ?? '');
    case 'polygon':
      return `${pointList(attrs['points'] ?? '')} Z`;
    case 'rect': {
      const x = num(attrs, 'x');
      const y = num(attrs, 'y');
      return `M${x} ${y} H${x + num(attrs, 'width')} V${y + num(attrs, 'height')} H${x} Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(attrs, 'cx');
      const cy = num(attrs, 'cy');
      const rx = tag === 'circle' ? num(attrs, 'r') : num(attrs, 'rx');
      const ry = tag === 'circle' ? rx : num(attrs, 'ry');
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    default:
      return null;
  }
}

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

function cubicAt(s: Segment, t: number): Point {
  const c1 = s.c1!;
  const c2 = s.c2!;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * s.from.x + b * c1.x + c * c2.x + e * s.to.x,
    y: a * s.from.y + b * c1.y + c * c2.y + e * s.to.y,
  };
}

/** Flatten a subpath to a polyline whose points are at most `step` apart (approximately, for curves). */
export function flatten(sub: Subpath, step: number): Point[] {
  const first = sub.segments[0];
  if (!first) return [];
  const pts: Point[] = [first.from];
  for (const s of sub.segments) {
    if (s.c1 && s.c2) {
      const len = dist(s.from, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.to);
      const n = Math.max(1, Math.ceil(len / step));
      for (let i = 1; i <= n; i++) pts.push(i === n ? s.to : cubicAt(s, i / n));
    } else {
      const n = Math.max(1, Math.ceil(dist(s.from, s.to) / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        pts.push(i === n ? s.to : { x: s.from.x + (s.to.x - s.from.x) * t, y: s.from.y + (s.to.y - s.from.y) * t });
      }
    }
  }
  return pts;
}

/** All polylines of a path's subpaths. */
export function polylines(d: string, step = 0.5): Point[][] {
  return parsePath(d).map((sub) => flatten(sub, step));
}
