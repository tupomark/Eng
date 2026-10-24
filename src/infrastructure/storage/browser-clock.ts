import { LiveClock } from "@/application/live-clock";

export function createBrowserClock() {
  return new LiveClock({
    now: () => Date.now(),
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    cancel: (handle) => window.clearTimeout(handle as number | undefined),
    onWake: (callback) => {
      const visible = () => {
        if (document.visibilityState === "visible") callback();
      };
      window.addEventListener("focus", callback);
      window.addEventListener("pageshow", callback);
      document.addEventListener("visibilitychange", visible);
      return () => {
        window.removeEventListener("focus", callback);
        window.removeEventListener("pageshow", callback);
        document.removeEventListener("visibilitychange", visible);
      };
    },
  });
}
