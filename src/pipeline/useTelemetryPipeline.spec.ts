import { effectScope, nextTick, watch } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { WireFrame } from '@/domain/telemetry';
import type { StreamSource } from '@/sources/StreamSource';
import { createManualScheduler } from './frameScheduler';
import { useTelemetryPipeline } from './useTelemetryPipeline';

const frame = (seq: number, id: number, value: number): WireFrame => [
  seq,
  1_000 + seq,
  id,
  value,
  0,
];

/** A source that yields fixed batches, then completes (or waits, if asked). */
function arraySource(batches: WireFrame[][], options: { hang?: boolean } = {}) {
  let closed = false;
  let release: (() => void) | null = null;
  const source: StreamSource<WireFrame> & { readonly closed: boolean } = {
    get closed() {
      return closed;
    },
    async *connect() {
      for (const batch of batches) yield batch;
      if (options.hang) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    },
    close() {
      closed = true;
      release?.();
    },
  };
  return source;
}

function setup(instruments = 10) {
  const scheduler = createManualScheduler();
  const scope = effectScope();
  const pipeline = scope.run(() =>
    useTelemetryPipeline({
      instruments,
      scheduler,
      capacity: 100,
      now: () => scheduler.now,
    }),
  )!;
  return { scheduler, scope, pipeline };
}

describe('useTelemetryPipeline', () => {
  it('commits the snapshot once per frame, not once per event', async () => {
    const { scheduler, pipeline } = setup();
    const commits = vi.fn();
    watch(pipeline.snapshot, commits, { flush: 'sync' });

    const frames = Array.from({ length: 500 }, (_, i) => frame(i, i % 10, i));
    pipeline.ingest(frames);
    expect(commits).not.toHaveBeenCalled();
    expect(pipeline.snapshot.value.frame).toBe(0);

    scheduler.tick(16);
    await nextTick();
    expect(commits).toHaveBeenCalledTimes(1);
    expect(pipeline.snapshot.value.frame).toBe(1);
    expect(pipeline.snapshot.value.updated).toHaveLength(10);
    expect(pipeline.snapshot.value.rows[3]!.value).toBe(493);
    expect(pipeline.stats.value.commits).toBe(1);
    expect(pipeline.stats.value.accepted).toBe(500);
  });

  it('rejects malformed frames before they reach the buffer', () => {
    const { scheduler, pipeline } = setup();
    pipeline.ingest([
      frame(0, 1, 1),
      'garbage',
      [1, 2, 3],
      frame(0, 1, 1),
      frame(1, 99, 1),
    ]);
    scheduler.tick();
    expect(pipeline.stats.value).toMatchObject({
      accepted: 2,
      malformed: 2,
      duplicate: 1,
      unknownInstrument: 1,
      flushed: 2,
    });
  });

  it('runs a source to completion and resolves', async () => {
    const { scheduler, pipeline } = setup();
    const source = arraySource([[frame(0, 0, 1)], [frame(1, 1, 2)]]);
    await pipeline.run(source);
    scheduler.tick();
    expect(pipeline.snapshot.value.rows[0]!.value).toBe(1);
    expect(pipeline.snapshot.value.rows[1]!.value).toBe(2);
  });

  it('a new source starts a new sequence space', async () => {
    const { scheduler, pipeline } = setup();
    await pipeline.run(arraySource([[frame(50_000, 0, 1)]]));
    scheduler.tick();
    // A replay that starts at seq 0 after a live session at seq 50 000 must
    // not be dropped as stale.
    await pipeline.run(arraySource([[frame(0, 1, 2), frame(1, 2, 3)]]));
    scheduler.tick();
    expect(pipeline.stats.value.stale).toBe(0);
    expect(pipeline.stats.value.accepted).toBe(3);
    expect(pipeline.snapshot.value.rows[1]!.value).toBe(2);
  });

  it('stop closes the source and ends the run', async () => {
    const { pipeline } = setup();
    const source = arraySource([], { hang: true });
    const running = pipeline.run(source);
    await Promise.resolve();
    pipeline.stop();
    expect(source.closed).toBe(true);
    await running;
  });

  it('a second run closes the first source', async () => {
    const { pipeline } = setup();
    const first = arraySource([], { hang: true });
    const second = arraySource([], { hang: true });
    const firstRun = pipeline.run(first);
    await Promise.resolve();
    const secondRun = pipeline.run(second);
    expect(first.closed).toBe(true);
    await firstRun;
    pipeline.stop();
    await secondRun;
  });

  it('pause holds the snapshot while events keep arriving; resume applies them', () => {
    const { scheduler, pipeline } = setup();
    pipeline.pause();
    expect(pipeline.paused.value).toBe(true);
    pipeline.ingest([frame(0, 0, 5)]);
    scheduler.tick();
    expect(pipeline.snapshot.value.frame).toBe(0);

    pipeline.resume();
    scheduler.tick();
    expect(pipeline.snapshot.value.frame).toBe(1);
    expect(pipeline.snapshot.value.rows[0]!.value).toBe(5);
  });

  it('flush commits immediately', () => {
    const { pipeline } = setup();
    pipeline.ingest([frame(0, 0, 5)]);
    pipeline.flush();
    expect(pipeline.snapshot.value.frame).toBe(1);
  });

  it('measures events and commits per second over the last second', () => {
    const { scheduler, pipeline } = setup();
    for (let f = 1; f <= 60; f++) {
      pipeline.ingest([frame(f, 0, f)]);
      scheduler.tick(f * (1000 / 60));
    }
    expect(pipeline.stats.value.eventsPerSecond).toBe(60);
    expect(pipeline.stats.value.commitsPerSecond).toBe(60);
  });

  it('reset replaces the fleet and clears counters', () => {
    const { scheduler, pipeline } = setup(2);
    pipeline.ingest([frame(0, 0, 1)]);
    scheduler.tick();
    pipeline.reset(5);
    expect(pipeline.snapshot.value.rows).toHaveLength(5);
    expect(pipeline.snapshot.value.frame).toBe(0);
    expect(pipeline.stats.value.accepted).toBe(0);
    // Sequence history is forgotten too: seq 0 is new again.
    pipeline.ingest([frame(0, 0, 2)]);
    scheduler.tick();
    expect(pipeline.stats.value.duplicate).toBe(0);
  });

  it('closes its source and stops scheduling when the scope is disposed', async () => {
    const { scheduler, scope, pipeline } = setup();
    const source = arraySource([], { hang: true });
    const running = pipeline.run(source);
    await Promise.resolve();
    pipeline.ingest([frame(0, 0, 1)]);
    scope.stop();
    expect(source.closed).toBe(true);
    expect(scheduler.pending).toBe(0);
    await running;
  });
});
