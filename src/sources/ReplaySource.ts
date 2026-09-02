import type { WireFrame } from '@/domain/telemetry';
import type { Recording } from './recording';
import type { StreamSource } from './StreamSource';

/**
 * How fast a recording plays back, relative to the timestamps in it. `step`
 * releases one batch per explicit {@link ReplaySource.step} call and otherwise
 * waits forever — the mode for looking at exactly one frame's worth of change.
 */
export type ReplaySpeed = 1 | 10 | 100 | 'step';

export interface ReplayTimers {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

const realTimers: ReplayTimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => {
    clearTimeout(id);
  },
};

export interface ReplaySourceOptions {
  readonly speed: ReplaySpeed;
  /**
   * Start again from the first frame when the recording ends, instead of
   * completing. For a demo that should not go quiet.
   *
   * @defaultValue `false`
   */
  readonly loop?: boolean;
  /**
   * Frames whose timestamps fall within the same window are delivered as one
   * batch. Matches a live tick, so replay and live look alike to the pipeline.
   *
   * @defaultValue `20`
   */
  readonly frameMs?: number;
  readonly timers?: ReplayTimers;
}

export interface ReplaySource extends StreamSource<WireFrame> {
  /** In `step` mode, release the next batch. A no-op in timed modes. */
  step(): void;
  setSpeed(speed: ReplaySpeed): void;
  /** Batches delivered so far, including repeats when looping. */
  readonly position: number;
  /** Batches in one pass of the recording. */
  readonly total: number;
}

interface Batch {
  /** Offset from the recording's first timestamp, in ms. */
  readonly at: number;
  readonly frames: readonly WireFrame[];
}

/** Group frames into batches by timestamp window. Pure; done once at creation. */
export function batchRecording(frames: readonly WireFrame[], frameMs: number): Batch[] {
  const first = frames[0];
  if (!first) return [];
  const origin = first[1];
  const batches: Batch[] = [];
  let bucket = -1;
  let current: WireFrame[] = [];
  for (const frame of frames) {
    const slot = Math.floor(Math.max(0, frame[1] - origin) / frameMs);
    if (slot !== bucket) {
      if (current.length > 0) batches.push({ at: bucket * frameMs, frames: current });
      bucket = slot;
      current = [];
    }
    current.push(frame);
  }
  if (current.length > 0) batches.push({ at: bucket * frameMs, frames: current });
  return batches;
}

/**
 * Replay a {@link Recording} through the same interface the live source uses.
 *
 * Pacing is relative: the gap between two batches is the gap between their
 * timestamps divided by the speed, so `1x` looks like the original session and
 * `100x` compresses a minute into six hundred milliseconds. The pipeline sees
 * the same batch shape either way, and cannot tell it is not live — which is
 * the whole point.
 */
export function createReplaySource(
  recording: Recording,
  options: ReplaySourceOptions,
): ReplaySource {
  const { loop = false, frameMs = 20, timers = realTimers } = options;
  let speed = options.speed;
  const batches = batchRecording(recording.frames, frameMs);

  let connected = false;
  let closed = false;
  let position = 0;
  let timer: number | null = null;
  /** Resolves the current wait — by timer, by `step()`, or by `close()`. */
  let release: (() => void) | null = null;

  function wake(): void {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    const fn = release;
    release = null;
    fn?.();
  }

  /** Wait for the gap before the next batch, however the current mode defines it. */
  function pause(gapMs: number): Promise<void> {
    return new Promise((resolve) => {
      release = resolve;
      if (speed !== 'step') {
        timer = timers.setTimeout(wake, gapMs / speed);
      }
    });
  }

  async function* run(): AsyncGenerator<readonly WireFrame[]> {
    try {
      do {
        let previousAt = 0;
        for (const batch of batches) {
          if (closed) return;
          await pause(batch.at - previousAt);
          // `closed` is re-checked after the await because `close()` flips it
          // while the wait is in flight. TypeScript narrowed it to `false` at
          // the guard above and cannot see the closure reassign it, so the
          // linter calls this redundant. Removing it would yield a batch from
          // a source the consumer has already closed.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (closed) return;
          previousAt = batch.at;
          position += 1;
          yield batch.frames;
        }
      } while (loop && !closed && batches.length > 0);
    } finally {
      closed = true;
      wake();
    }
  }

  function connect(): AsyncIterable<readonly WireFrame[]> {
    if (connected) throw new Error('ReplaySource is single-use: already connected');
    connected = true;
    return run();
  }

  function close(): void {
    closed = true;
    wake();
  }

  function step(): void {
    if (speed === 'step') wake();
  }

  function setSpeed(next: ReplaySpeed): void {
    if (next === speed) return;
    speed = next;
    // A change mid-wait applies immediately: leaving `step` should start
    // playing, and entering it should stop the clock. Re-arming with the full
    // gap is a small inaccuracy nobody can perceive.
    if (release) {
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      timer = timers.setTimeout(wake, 0);
    }
  }

  return {
    connect,
    close,
    step,
    setSpeed,
    get position() {
      return position;
    },
    get total() {
      return batches.length;
    },
  };
}
