import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveClock } from "../../src/application/live-clock";

describe("shared learning clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T23:59:30Z"));
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    let wake = () => {};
    const detach = vi.fn();
    const clock = new LiveClock({
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      onWake: (callback) => {
        wake = callback;
        return detach;
      },
    });
    return { clock, detach, wake: () => wake() };
  }

  it("publishes an exact due boundary to all views with one timer", () => {
    const { clock } = setup();
    const home = vi.fn(),
      learn = vi.fn(),
      core = vi.fn();
    const unsubscribers = [home, learn, core].map(clock.subscribe);
    const due = Date.now() + 5_000;
    clock.setDeadline(due);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4_999);
    expect(clock.getSnapshot()).toBeLessThan(due);
    vi.advanceTimersByTime(1);
    expect(clock.getSnapshot()).toBe(due);
    for (const listener of [home, learn, core])
      expect(listener).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers from a background time jump and date change without replaying missed ticks", () => {
    const { clock, wake, detach } = setup();
    const unsubscribe = clock.subscribe(vi.fn());
    clock.setDeadline(Date.now() + 60_000);
    const resumed = new Date("2026-10-25T03:30:00Z").getTime();
    vi.setSystemTime(resumed);
    wake();
    expect(clock.getSnapshot()).toBe(resumed);
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe();
    expect(detach).toHaveBeenCalledOnce();
  });

  it("reschedules a changed due date and follows backward device clock corrections", () => {
    const { clock, wake } = setup();
    const unsubscribe = clock.subscribe(vi.fn());
    clock.setDeadline(Date.now() + 30_000);
    clock.setDeadline(Date.now() + 1_000);
    vi.advanceTimersByTime(1_000);
    expect(clock.getSnapshot()).toBe(Date.now());
    const corrected = Date.now() - 90_000;
    vi.setSystemTime(corrected);
    wake();
    expect(clock.getSnapshot()).toBe(corrected);
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe();
  });
});
