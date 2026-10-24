/** One clock for time-sensitive views. The environment owns browser lifecycle APIs. */
export interface ClockEnvironment {
  now(): number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
  onWake(callback: () => void): () => void;
}

export class LiveClock {
  private snapshot = 0;
  private readonly deadlines = new Map<string, number>();
  private timer: unknown;
  private detach: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly environment: ClockEnvironment) {}

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.detach = this.environment.onWake(this.refresh);
      this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.environment.cancel(this.timer);
        this.detach?.();
        this.detach = null;
      }
    };
  };

  /** The next future review, if any. No intervals compete across screens. */
  setDeadline(deadline: number | null, source = "legacy") {
    if (deadline === null) this.deadlines.delete(source);
    else if (Number.isFinite(deadline)) this.deadlines.set(source, deadline);
    else throw new Error("A finite review deadline is required.");
    if (this.listeners.size) this.refresh();
  }

  refresh = () => {
    const now = this.environment.now();
    if (!Number.isFinite(now)) return;
    this.environment.cancel(this.timer);
    const changed = now !== this.snapshot;
    this.snapshot = now;
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const next = Math.min(
      now + 60_000,
      midnight.getTime(),
      ...[...this.deadlines.values()].filter((deadline) => deadline > now),
    );
    if (this.listeners.size)
      this.timer = this.environment.schedule(
        this.refresh,
        Math.max(1, next - now),
      );
    if (changed) this.listeners.forEach((listener) => listener());
  };
}
