/**
 * The one seam between the pipeline and `requestAnimationFrame`.
 *
 * Everything that batches by frame takes a scheduler rather than calling rAF
 * directly, so a test can say "a frame happened now" and assert what was
 * committed — instead of awaiting real frames and hoping the machine is not
 * busy. It is also where a different cadence would plug in: a worker without
 * rAF, or a headless benchmark stepping frames by hand.
 */
export interface FrameScheduler {
  /** Run `callback` on the next frame. Returns a handle for {@link cancel}. */
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export const animationFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

export interface ManualScheduler extends FrameScheduler {
  /**
   * Fire every callback requested before this call, in order, with `now`.
   * Callbacks requested *during* the tick wait for the next one, as with rAF.
   *
   * @param now Frame timestamp. Defaults to advancing by one 60 Hz frame.
   */
  tick(now?: number): void;
  readonly pending: number;
  readonly now: number;
}

const FRAME_MS = 1000 / 60;

export function createManualScheduler(): ManualScheduler {
  const callbacks = new Map<number, (now: number) => void>();
  let nextHandle = 1;
  let clock = 0;

  return {
    request(callback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      callbacks.delete(handle);
    },
    tick(now = clock + FRAME_MS) {
      clock = now;
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback(now);
    },
    get pending() {
      return callbacks.size;
    },
    get now() {
      return clock;
    },
  };
}
