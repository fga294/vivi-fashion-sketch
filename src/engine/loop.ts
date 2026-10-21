/** A frame task returns true while it still has work for the next frame. */
export type FrameTask = (now: number) => boolean;

/**
 * The one requestAnimationFrame loop for canvas work and effects. It sleeps
 * when no task has work and wakes when input arrives.
 */
export class Loop {
  private readonly tasks: FrameTask[] = [];
  private raf = 0;

  add(task: FrameTask): void {
    this.tasks.push(task);
    this.wake();
  }

  wake(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    let more = false;
    for (let i = 0; i < this.tasks.length; i++) if (this.tasks[i]!(now)) more = true;
    if (more) this.wake();
  };
}
