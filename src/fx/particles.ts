// Fixed pools of particles in structure-of-arrays form. Spawning, updating and
// drawing never allocate; dead particles are swap-removed to keep the live ones packed.

/** A rectangle grown to cover everything drawn this frame, in sheet units. */
export class Bounds {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  get empty(): boolean {
    return this.x1 < this.x0;
  }

  reset(): void {
    this.x0 = this.y0 = Infinity;
    this.x1 = this.y1 = -Infinity;
  }

  add(x: number, y: number, r: number): void {
    if (x - r < this.x0) this.x0 = x - r;
    if (y - r < this.y0) this.y0 = y - r;
    if (x + r > this.x1) this.x1 = x + r;
    if (y + r > this.y1) this.y1 = y + r;
  }

  copy(from: Bounds): void {
    this.x0 = from.x0;
    this.y0 = from.y0;
    this.x1 = from.x1;
    this.y1 = from.y1;
  }
}

type Ctx = CanvasRenderingContext2D;

/** Wax crumbs: 2–4 units, pop up, fall under gravity and fade over 600 ms. */
export class Crumbs {
  static readonly CAP = 120;
  static readonly LIFE = 600;
  /** Units per ms². */
  static readonly GRAVITY = 0.0007;
  readonly x = new Float32Array(Crumbs.CAP);
  readonly y = new Float32Array(Crumbs.CAP);
  readonly vx = new Float32Array(Crumbs.CAP);
  readonly vy = new Float32Array(Crumbs.CAP);
  readonly size = new Float32Array(Crumbs.CAP);
  readonly age = new Float32Array(Crumbs.CAP);
  count = 0;

  /** Returns false (and spawns nothing) when the pool is full. */
  spawn(x: number, y: number, vx: number, vy: number, size: number): boolean {
    if (this.count >= Crumbs.CAP) return false;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.size[i] = size;
    this.age[i] = 0;
    return true;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      const age = this.age[i]! + dt;
      if (age >= Crumbs.LIFE) {
        this.retire(i);
        continue;
      }
      this.age[i] = age;
      this.vy[i]! += Crumbs.GRAVITY * dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
    }
  }

  draw(ctx: Ctx, colour: string, bounds: Bounds): void {
    ctx.fillStyle = colour;
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i]! / Crumbs.LIFE;
      const r = this.size[i]! / 2;
      ctx.globalAlpha = 1 - t * t;
      ctx.beginPath();
      ctx.arc(this.x[i]!, this.y[i]!, r, 0, Math.PI * 2);
      ctx.fill();
      bounds.add(this.x[i]!, this.y[i]!, r + 1);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.count = 0;
  }

  private retire(i: number): void {
    const last = --this.count;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.size[i] = this.size[last]!;
    this.age[i] = this.age[last]!;
  }
}

/** Four-point star glints on newly revealed lines: grow 0 → 1 → 0 over 350 ms. */
export class Glints {
  static readonly CAP = 60;
  static readonly LIFE = 350;
  /** Star radius at full size, in units. */
  static readonly R = 12;
  readonly x = new Float32Array(Glints.CAP);
  readonly y = new Float32Array(Glints.CAP);
  readonly age = new Float32Array(Glints.CAP);
  readonly gold = new Uint8Array(Glints.CAP);
  count = 0;

  spawn(x: number, y: number, gold: boolean): boolean {
    if (this.count >= Glints.CAP) return false;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.age[i] = 0;
    this.gold[i] = gold ? 1 : 0;
    return true;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      const age = this.age[i]! + dt;
      if (age < Glints.LIFE) {
        this.age[i] = age;
        continue;
      }
      const last = --this.count;
      this.x[i] = this.x[last]!;
      this.y[i] = this.y[last]!;
      this.age[i] = this.age[last]!;
      this.gold[i] = this.gold[last]!;
    }
  }

  /** With reduced motion the stars fade in and out at full size instead of growing. */
  draw(ctx: Ctx, reduced: boolean, bounds: Bounds): void {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(176, 132, 40, 0.55)';
    for (let i = 0; i < this.count; i++) {
      const k = Math.sin((Math.PI * this.age[i]!) / Glints.LIFE);
      const r = Glints.R * (reduced ? 1 : k);
      if (r < 0.5) continue;
      const x = this.x[i]!;
      const y = this.y[i]!;
      ctx.globalAlpha = reduced ? k : 1;
      ctx.fillStyle = this.gold[i] ? '#F6DE8D' : '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
      ctx.stroke();
      bounds.add(x, y, r + 1);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.count = 0;
  }
}

/** easeOutBack: overshoots a little past 1, then settles. */
function popScale(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/** Hearts and stars bursting from a completed band: pop in, arc outward under gravity, fade over 900 ms. */
export class Sparks {
  static readonly CAP = 96;
  static readonly LIFE = 900;
  /** Units per ms². */
  static readonly GRAVITY = 0.00045;
  static readonly POP_MS = 140;
  readonly x = new Float32Array(Sparks.CAP);
  readonly y = new Float32Array(Sparks.CAP);
  readonly vx = new Float32Array(Sparks.CAP);
  readonly vy = new Float32Array(Sparks.CAP);
  readonly age = new Float32Array(Sparks.CAP);
  readonly size = new Float32Array(Sparks.CAP);
  readonly rot = new Float32Array(Sparks.CAP);
  readonly spin = new Float32Array(Sparks.CAP);
  readonly colour = new Uint8Array(Sparks.CAP);
  readonly shape = new Uint8Array(Sparks.CAP);
  /** Reduced motion: stays where it appeared and fades in and out at full size. */
  readonly still = new Uint8Array(Sparks.CAP);
  count = 0;

  spawn(x: number, y: number, vx: number, vy: number, size: number, rot: number, spin: number, colour: number, shape: number, still: boolean): boolean {
    if (this.count >= Sparks.CAP) return false;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = still ? 0 : vx;
    this.vy[i] = still ? 0 : vy;
    this.age[i] = 0;
    this.size[i] = size;
    this.rot[i] = rot;
    this.spin[i] = still ? 0 : spin;
    this.colour[i] = colour;
    this.shape[i] = shape;
    this.still[i] = still ? 1 : 0;
    return true;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      const age = this.age[i]! + dt;
      if (age >= Sparks.LIFE) {
        this.retire(i);
        continue;
      }
      this.age[i] = age;
      if (this.still[i]) continue;
      this.vy[i]! += Sparks.GRAVITY * dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.rot[i]! += this.spin[i]! * dt;
    }
  }

  /** Draw with `shapes` (unit paths, by shape index) in `fills`/`strokes` (by colour index); `s` is the sheet scale. */
  draw(ctx: Ctx, s: number, shapes: readonly Path2D[], fills: readonly string[], strokes: readonly string[], bounds: Bounds): void {
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i]! / Sparks.LIFE;
      let k: number;
      let alpha: number;
      if (this.still[i]) {
        k = 1;
        alpha = Math.sin(Math.PI * t);
      } else {
        k = popScale(Math.min(1, this.age[i]! / Sparks.POP_MS));
        const fade = Math.max(0, (t - 0.45) / 0.55);
        alpha = 1 - fade * fade;
      }
      const size = this.size[i]! * k;
      if (size < 1 || alpha <= 0.01) continue;
      const x = this.x[i]!;
      const y = this.y[i]!;
      const c = Math.cos(this.rot[i]!) * size * s;
      const sn = Math.sin(this.rot[i]!) * size * s;
      ctx.setTransform(c, sn, -sn, c, x * s, y * s);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fills[this.colour[i]!]!;
      ctx.strokeStyle = strokes[this.colour[i]!]!;
      ctx.lineWidth = 1.6 / size;
      const shape = shapes[this.shape[i]!]!;
      ctx.fill(shape);
      ctx.stroke(shape);
      bounds.add(x, y, size * 0.75 + 1);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.count = 0;
  }

  private retire(i: number): void {
    const last = --this.count;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.age[i] = this.age[last]!;
    this.size[i] = this.size[last]!;
    this.rot[i] = this.rot[last]!;
    this.spin[i] = this.spin[last]!;
    this.colour[i] = this.colour[last]!;
    this.shape[i] = this.shape[last]!;
    this.still[i] = this.still[last]!;
  }
}

/** Confetti for the whole outfit: falls from the top of the frame, swaying and tumbling. */
export class Confetti {
  static readonly CAP = 90;
  /** Nothing lasts longer than this (ms), wherever it is. */
  static readonly MAX_LIFE = 4000;
  readonly x0 = new Float32Array(Confetti.CAP);
  readonly y = new Float32Array(Confetti.CAP);
  readonly vy = new Float32Array(Confetti.CAP);
  /** Negative while waiting to start falling. */
  readonly age = new Float32Array(Confetti.CAP);
  readonly w = new Float32Array(Confetti.CAP);
  readonly h = new Float32Array(Confetti.CAP);
  readonly rot = new Float32Array(Confetti.CAP);
  readonly spin = new Float32Array(Confetti.CAP);
  readonly flipRate = new Float32Array(Confetti.CAP);
  readonly sway = new Float32Array(Confetti.CAP);
  readonly swayRate = new Float32Array(Confetti.CAP);
  readonly colour = new Uint8Array(Confetti.CAP);
  count = 0;

  spawn(x: number, y: number, vy: number, w: number, h: number, spin: number, flipRate: number, sway: number, swayRate: number, delay: number, colour: number): boolean {
    if (this.count >= Confetti.CAP) return false;
    const i = this.count++;
    this.x0[i] = x;
    this.y[i] = y;
    this.vy[i] = vy;
    this.age[i] = -delay;
    this.w[i] = w;
    this.h[i] = h;
    this.rot[i] = x; // any starting angle
    this.spin[i] = spin;
    this.flipRate[i] = flipRate;
    this.sway[i] = sway;
    this.swayRate[i] = swayRate;
    this.colour[i] = colour;
    return true;
  }

  /** Retire pieces that fell past `bottom` (sheet units). */
  update(dt: number, bottom: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      const age = this.age[i]! + dt;
      this.age[i] = age;
      if (age <= 0) continue;
      this.y[i]! += this.vy[i]! * Math.min(dt, age); // only for the time since it started falling
      if (this.y[i]! > bottom || age > Confetti.MAX_LIFE) this.retire(i);
    }
  }

  xAt(i: number): number {
    return this.x0[i]! + Math.sin(this.age[i]! * this.swayRate[i]! + this.rot[i]!) * this.sway[i]!;
  }

  draw(ctx: Ctx, s: number, fills: readonly string[], bounds: Bounds): void {
    for (let i = 0; i < this.count; i++) {
      const age = this.age[i]!;
      if (age < 0) continue;
      const x = this.xAt(i);
      const y = this.y[i]!;
      const a = this.rot[i]! + this.spin[i]! * age;
      // Tumbling: the piece's height swings through zero as it flips over.
      const flip = Math.cos(age * this.flipRate[i]!);
      const c = Math.cos(a) * s;
      const sn = Math.sin(a) * s;
      const w = this.w[i]!;
      const h = this.h[i]! * flip;
      ctx.setTransform(c * w, sn * w, -sn * h, c * h, x * s, y * s);
      ctx.fillStyle = fills[this.colour[i]!]!;
      ctx.fillRect(-0.5, -0.5, 1, 1);
      bounds.add(x, y, Math.max(w, this.h[i]!) * 0.75 + 1);
    }
  }

  clear(): void {
    this.count = 0;
  }

  private retire(i: number): void {
    const last = --this.count;
    this.x0[i] = this.x0[last]!;
    this.y[i] = this.y[last]!;
    this.vy[i] = this.vy[last]!;
    this.age[i] = this.age[last]!;
    this.w[i] = this.w[last]!;
    this.h[i] = this.h[last]!;
    this.rot[i] = this.rot[last]!;
    this.spin[i] = this.spin[last]!;
    this.flipRate[i] = this.flipRate[last]!;
    this.sway[i] = this.sway[last]!;
    this.swayRate[i] = this.swayRate[last]!;
    this.colour[i] = this.colour[last]!;
  }
}
