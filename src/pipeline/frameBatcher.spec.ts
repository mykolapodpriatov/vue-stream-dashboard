import { describe, expect, it, vi } from 'vitest';
import { createFrameBatcher } from './frameBatcher';
import { createManualScheduler } from './frameScheduler';

function harness(capacity = 1_000) {
  const scheduler = createManualScheduler();
  const flushes: { batch: number[]; frame: number; now: number }[] = [];
  const batcher = createFrameBatcher<number>({
    capacity,
    scheduler,
    onFlush: (batch, info) => {
      // The batch array is reused — copy, as the contract says.
      flushes.push({ batch: [...batch], frame: info.frame, now: info.now });
    },
  });
  return { scheduler, flushes, batcher };
}

describe('createFrameBatcher', () => {
  it('never flushes on ingest, only on the frame', () => {
    const { scheduler, flushes, batcher } = harness();
    batcher.ingest([1, 2, 3]);
    batcher.ingestOne(4);
    expect(flushes).toEqual([]);
    expect(batcher.pending).toBe(4);
    expect(scheduler.pending).toBe(1);

    scheduler.tick(16);
    expect(flushes).toEqual([{ batch: [1, 2, 3, 4], frame: 1, now: 16 }]);
    expect(batcher.pending).toBe(0);
  });

  it('coalesces everything between two frames into one commit', () => {
    // The structural invariant: 500 events across 5 frames is 5 commits,
    // not 500 — and the number of commits cannot exceed the number of frames.
    const { scheduler, flushes, batcher } = harness();
    for (let frame = 0; frame < 5; frame++) {
      for (let i = 0; i < 100; i++) batcher.ingestOne(frame * 100 + i);
      scheduler.tick();
    }
    expect(flushes).toHaveLength(5);
    expect(flushes.every((f) => f.batch.length === 100)).toBe(true);
    expect(batcher.stats.commits).toBe(5);
    expect(batcher.stats.ingested).toBe(500);
    expect(batcher.stats.flushed).toBe(500);
  });

  it('requests exactly one frame no matter how many ingests arrive', () => {
    const { scheduler, batcher } = harness();
    for (let i = 0; i < 1_000; i++) batcher.ingestOne(i);
    expect(scheduler.pending).toBe(1);
  });

  it('does not commit an empty frame or ask for one when idle', () => {
    const { scheduler, flushes, batcher } = harness();
    batcher.ingest([]);
    expect(scheduler.pending).toBe(0);
    scheduler.tick();
    expect(flushes).toEqual([]);
    expect(batcher.stats.commits).toBe(0);
  });

  it('drops the oldest items past capacity and reports it on the next commit', () => {
    const { scheduler, flushes, batcher } = harness(3);
    batcher.ingest([1, 2, 3, 4, 5]);
    scheduler.tick();
    expect(flushes[0]?.batch).toEqual([3, 4, 5]);
    expect(batcher.stats.dropped).toBe(2);
  });

  it('pause holds commits; resume schedules one if anything is pending', () => {
    const { scheduler, flushes, batcher } = harness();
    batcher.ingest([1]);
    batcher.pause();
    expect(scheduler.pending).toBe(0);
    batcher.ingest([2]);
    scheduler.tick();
    expect(flushes).toEqual([]);
    expect(batcher.paused).toBe(true);

    batcher.resume();
    expect(scheduler.pending).toBe(1);
    scheduler.tick(50);
    expect(flushes).toEqual([{ batch: [1, 2], frame: 1, now: 50 }]);
  });

  it('resume with nothing pending does not schedule a frame', () => {
    const { scheduler, batcher } = harness();
    batcher.pause();
    batcher.resume();
    expect(scheduler.pending).toBe(0);
  });

  it('flush() commits immediately, outside the cadence', () => {
    const { scheduler, flushes, batcher } = harness();
    batcher.ingest([1, 2]);
    batcher.flush(7);
    expect(flushes).toEqual([{ batch: [1, 2], frame: 1, now: 7 }]);
    // The already-requested frame then finds nothing and commits nothing.
    scheduler.tick();
    expect(flushes).toHaveLength(1);
  });

  it('tracks the last and largest batch', () => {
    const { scheduler, batcher } = harness();
    batcher.ingest([1, 2, 3]);
    scheduler.tick();
    batcher.ingest([4]);
    scheduler.tick();
    expect(batcher.stats.lastBatch).toBe(1);
    expect(batcher.stats.maxBatch).toBe(3);
  });

  it('dispose cancels the frame and ignores further ingests', () => {
    const { scheduler, flushes, batcher } = harness();
    batcher.ingest([1]);
    batcher.dispose();
    expect(scheduler.pending).toBe(0);
    batcher.ingest([2]);
    batcher.flush();
    scheduler.tick();
    expect(flushes).toEqual([]);
    expect(batcher.pending).toBe(0);
  });

  it('uses requestAnimationFrame when no scheduler is given', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const batcher = createFrameBatcher<number>({ capacity: 10, onFlush: () => {} });
    batcher.ingestOne(1);
    expect(raf).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });
});
