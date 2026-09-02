import {
  getCurrentScope,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { TelemetryEvent, WireFrame } from '@/domain/telemetry';
import type { StreamSource } from '@/sources/StreamSource';
import { createFrameBatcher, type BatcherStats } from './frameBatcher';
import type { FrameScheduler } from './frameScheduler';
import { createNormalizer, type NormalizerStats } from './normalizer';
import { createRateMeter } from './rateMeter';
import { createTelemetryState, type Snapshot } from './telemetryState';

export interface PipelineStats extends BatcherStats, NormalizerStats {
  /** Events applied per second, over the last second. */
  eventsPerSecond: number;
  /** Snapshot commits per second, over the last second. */
  commitsPerSecond: number;
  /** Events that addressed an instrument outside the fleet. */
  unknownInstrument: number;
}

export interface UseTelemetryPipelineOptions {
  instruments: number;
  /**
   * Ring buffer capacity in events. Sized for the worst late frame you want
   * to survive intact: at 20k events/s, 32k events is about 1.6 s.
   *
   * @defaultValue `32768`
   */
  capacity?: number;
  scheduler?: FrameScheduler;
  /** Clock for the rate meter. Injectable for tests. */
  now?: () => number;
}

export interface TelemetryPipeline {
  /** The current frame's state. Replaced — never mutated — once per commit. */
  snapshot: ShallowRef<Snapshot>;
  /** Counters, also replaced once per commit rather than on every event. */
  stats: ShallowRef<PipelineStats>;
  paused: Readonly<Ref<boolean>>;
  /** Push raw frames in. Validation, buffering and scheduling happen here. */
  ingest: (frames: readonly unknown[]) => void;
  /**
   * Drain a source into the pipeline until it completes or is replaced.
   * Resolves when the source's iteration ends.
   */
  run: (source: StreamSource<WireFrame>) => Promise<void>;
  /** Close the current source. The pipeline keeps its state. */
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** Commit what is pending now, outside the frame cadence. */
  flush: () => void;
  /** Replace the fleet and forget every reading. */
  reset: (instruments: number) => void;
}

/**
 * The pipeline in one composable:
 *
 * ```
 * frames → normalizer → ring buffer → frame → apply → snapshot → shallowRef
 * ```
 *
 * The only reactive writes in the whole path are the two `shallowRef`
 * assignments in `onFlush`, and they happen once per frame regardless of how
 * many events arrived. A component that depends on `snapshot` re-renders at
 * most once per paint; nothing in Vue's dependency graph is touched per event.
 */
export function useTelemetryPipeline(
  options: UseTelemetryPipelineOptions,
): TelemetryPipeline {
  const { instruments, capacity = 32_768, now = () => performance.now() } = options;

  const state = createTelemetryState(instruments);
  const normalizer = createNormalizer();
  const eventRate = createRateMeter();
  const commitRate = createRateMeter();
  let unknownInstrument = 0;

  const snapshot = shallowRef<Snapshot>(state.snapshot(0, now()));
  const paused = ref(false);

  const batcher = createFrameBatcher<TelemetryEvent>({
    capacity,
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    onFlush(batch, info) {
      unknownInstrument += state.apply(batch);
      eventRate.sample(info.now, info.size);
      commitRate.sample(info.now, 1);
      snapshot.value = state.snapshot(info.frame, info.now);
      stats.value = collectStats(info.now);
    },
  });

  function collectStats(at: number): PipelineStats {
    return {
      ...batcher.stats,
      ...normalizer.stats,
      eventsPerSecond: eventRate.rate(at),
      commitsPerSecond: commitRate.rate(at),
      unknownInstrument,
    };
  }

  const stats = shallowRef<PipelineStats>(collectStats(now()));

  function ingest(frames: readonly unknown[]): void {
    for (const frame of frames) {
      const event = normalizer.normalize(frame);
      if (event) batcher.ingestOne(event);
    }
  }

  let current: StreamSource<WireFrame> | null = null;

  async function run(source: StreamSource<WireFrame>): Promise<void> {
    stop();
    current = source;
    // Sequence numbers belong to a source. Carrying the previous source's
    // history across would reject every frame of a replay that starts at
    // seq 0 as "stale" — found by the end-to-end suite, not by reasoning.
    normalizer.forgetSequence();
    try {
      for await (const batch of source.connect()) {
        // A newer `run()` has taken over; this loop is stale and must not
        // feed the pipeline from a source the caller thinks is closed.
        if (current !== source) break;
        ingest(batch);
      }
    } finally {
      if (current === source) current = null;
    }
  }

  function stop(): void {
    const source = current;
    current = null;
    source?.close();
  }

  function pause(): void {
    batcher.pause();
    paused.value = true;
  }

  function resume(): void {
    batcher.resume();
    paused.value = false;
  }

  function flush(): void {
    batcher.flush(now());
  }

  function reset(count: number): void {
    state.resize(count);
    normalizer.reset();
    eventRate.reset();
    commitRate.reset();
    unknownInstrument = 0;
    snapshot.value = state.snapshot(0, now());
    stats.value = collectStats(now());
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop();
      batcher.dispose();
    });
  }

  return {
    snapshot,
    stats,
    paused: readonly(paused),
    ingest,
    run,
    stop,
    pause,
    resume,
    flush,
    reset,
  };
}
