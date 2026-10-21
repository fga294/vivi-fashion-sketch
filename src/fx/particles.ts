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
