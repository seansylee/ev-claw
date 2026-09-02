/**
 * Two independent, serial FIFO lanes. See PLAN.md "Why two lanes, not one":
 * a background job (or a future canUseTool confirmation) can take a long
 * time, and running everything through one lane would let slow background
 * work freeze chat responsiveness. Each lane serializes its own work so two
 * jobs never race on the same DB rows or double-fire a tool; the lanes
 * themselves run concurrently with each other.
 */
class Lane {
  private readonly name: string;
  private readonly queue: Array<() => Promise<void>> = [];
  private draining = false;

  constructor(name: string) {
    this.name = name;
  }

  enqueue(job: () => Promise<void>): void {
    this.queue.push(job);
    void this.drain();
  }

  get length(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await job();
      } catch (err) {
        console.error(`[queue:${this.name}] job failed:`, err);
      }
    }
    this.draining = false;
  }
}

/** Incoming Discord chat turns — kept fast and strictly ordered per conversation. */
export const interactiveLane = new Lane("interactive");

/** Cron ticks, watchdog checks, future task-runner steps. */
export const backgroundLane = new Lane("background");
