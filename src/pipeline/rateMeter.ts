/**
 * Events per second over a sliding window, sampled at frame boundaries.
 *
 * A counter divided by uptime tells you the average since the page loaded,
 * which is useless the moment the rate changes. A sliding window answers the
 * question the UI is actually asking: how fast is it *now*?
 */
export interface RateMeter {
  /** Record `count` items at time `now`. */
  sample(now: number, count: number): void;
  /** Items per second across the window ending at `now`. */
  rate(now: number): number;
  reset(): void;
}

export function createRateMeter(windowMs = 1000): RateMeter {
  const times: number[] = [];
  const counts: number[] = [];

  function evict(now: number): void {
    const cutoff = now - windowMs;
    let drop = 0;
    for (const time of times) {
      if (time > cutoff) break;
      drop += 1;
    }
    if (drop > 0) {
      times.splice(0, drop);
      counts.splice(0, drop);
    }
  }

  return {
    sample(now, count) {
      times.push(now);
      counts.push(count);
      evict(now);
    },
    rate(now) {
      evict(now);
      let total = 0;
      for (const count of counts) total += count;
      return (total * 1000) / windowMs;
    },
    reset() {
      times.length = 0;
      counts.length = 0;
    },
  };
}
