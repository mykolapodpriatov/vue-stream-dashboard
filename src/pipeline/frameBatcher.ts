import { animationFrameScheduler, type FrameScheduler } from './frameScheduler';
import { createRingBuffer } from './ringBuffer';

export interface FrameInfo {
  /** Commits so far, including this one. */
  readonly frame: number;
  /** The scheduler's timestamp for this frame. */
  readonly now: number;
  /** Items in this batch. */
  readonly size: number;
}

export interface BatcherStats {
  /** Items handed to `ingest`. */
  ingested: number;
  /** Items delivered to `onFlush`. */
  flushed: number;
  /** Items overwritten in the buffer before a frame came. */
  dropped: number;
  /** Times `onFlush` ran. Frames with nothing pending do not count. */
  commits: number;
  lastBatch: number;
  maxBatch: number;
}

export interface FrameBatcherOptions<T> {
  /** Ring buffer size, in items. */
  capacity: number;
  /**
   * Receives everything ingested since the previous frame, at most once per
   * frame. **The array is reused** between calls — copy it if it must outlive
   * the callback.
   */
  onFlush: (batch: readonly T[], info: FrameInfo) => void;
  /**
   * @defaultValue {@link animationFrameScheduler}
   */
  scheduler?: FrameScheduler;
}

export interface FrameBatcher<T> {
  ingest(items: readonly T[]): void;
  ingestOne(item: T): void;
  /** Deliver whatever is pending right now, outside the frame cadence. */
  flush(now?: number): void;
  /** Stop committing. Items keep arriving into the buffer and the oldest fall off. */
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  readonly pending: number;
  readonly stats: Readonly<BatcherStats>;
  dispose(): void;
}

/**
 * The thesis, as a function: **events go in whenever they arrive; the consumer
 * hears about them once per frame.**
 *
 * `ingest` never calls `onFlush`. It appends to a ring buffer and, if no frame
 * is already scheduled, asks for one. When the frame fires, the buffer is
 * drained into a single batch and delivered once. Ten events or ten thousand
 * between two paints cost the consumer exactly one call — and, downstream, one
 * reactive write.
 *
 * A frame with nothing pending is not a commit. The scheduler is only asked
 * for a frame when there is something to say, so an idle feed costs nothing.
 */
export function createFrameBatcher<T>(options: FrameBatcherOptions<T>): FrameBatcher<T> {
  const { capacity, onFlush, scheduler = animationFrameScheduler } = options;
  const buffer = createRingBuffer<T>(capacity);
  /** Reused across flushes to keep the hot path allocation-free. */
  const batch: T[] = [];
  const stats: BatcherStats = {
    ingested: 0,
    flushed: 0,
    dropped: 0,
    commits: 0,
    lastBatch: 0,
    maxBatch: 0,
  };
  let handle: number | null = null;
  let paused = false;
  let disposed = false;

  function schedule(): void {
    if (paused || disposed || handle !== null) return;
    handle = scheduler.request(onFrame);
  }

  function onFrame(now: number): void {
    handle = null;
    flush(now);
  }

  function unschedule(): void {
    if (handle !== null) {
      scheduler.cancel(handle);
      handle = null;
    }
  }

  function ingestOne(item: T): void {
    if (disposed) return;
    buffer.push(item);
    stats.ingested += 1;
    schedule();
  }

  function ingest(items: readonly T[]): void {
    if (disposed) return;
    for (const item of items) buffer.push(item);
    stats.ingested += items.length;
    if (items.length > 0) schedule();
  }

  function flush(now = performance.now()): void {
    if (disposed || buffer.size === 0) return;
    batch.length = 0;
    const size = buffer.drain(batch);
    stats.dropped = buffer.dropped;
    stats.flushed += size;
    stats.commits += 1;
    stats.lastBatch = size;
    if (size > stats.maxBatch) stats.maxBatch = size;
    onFlush(batch, { frame: stats.commits, now, size });
  }

  function pause(): void {
    paused = true;
    unschedule();
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    if (buffer.size > 0) schedule();
  }

  function dispose(): void {
    disposed = true;
    unschedule();
    buffer.clear();
    batch.length = 0;
  }

  return {
    ingest,
    ingestOne,
    flush,
    pause,
    resume,
    dispose,
    stats,
    get paused() {
      return paused;
    },
    get pending() {
      return buffer.size;
    },
  };
}
