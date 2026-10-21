/**
 * Places crayon stamps at even spacing along a pointer path, however far the
 * pointer jumps between events, so fast scrubs leave no gaps. Distance carries
 * over between moves so spacing stays even across events and frames.
 */
export class StampSpacer {
  readonly spacing: number;
  private x = 0;
  private y = 0;
  /** Distance travelled since the last stamp. */
  private carry = 0;
  private moved = false;
  /** Direction of travel (radians) of the most recent movement. */
  angle = 0;

  constructor(spacing: number) {
    this.spacing = spacing;
  }

  begin(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.carry = 0;
    this.moved = false;
  }

  /** Move to (x, y), calling `stamp` for each stamp position passed on the way. */
  moveTo(x: number, y: number, stamp: (x: number, y: number, angle: number) => void): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    this.angle = Math.atan2(dy, dx);
    if (!this.moved) {
      // The first stamp waits for the first movement so it knows its direction.
      this.moved = true;
      stamp(this.x, this.y, this.angle);
    }
    let d = this.spacing - this.carry;
    while (d <= len) {
      stamp(this.x + (dx * d) / len, this.y + (dy * d) / len, this.angle);
      d += this.spacing;
    }
    this.carry = len - (d - this.spacing);
    this.x = x;
    this.y = y;
  }

  /** Finish the stroke; a press with no movement still leaves one stamp. */
  end(stamp: (x: number, y: number, angle: number) => void): void {
    if (!this.moved) stamp(this.x, this.y, this.angle);
    this.moved = true;
  }
}
