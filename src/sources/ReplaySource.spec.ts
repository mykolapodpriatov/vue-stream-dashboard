import { describe, expect, it } from 'vitest';
import type { WireFrame } from '@/domain/telemetry';
import type { Recording } from './recording';
import { batchRecording, createReplaySource, type ReplayTimers } from './ReplaySource';

/** Timers the test advances by hand, so pacing is asserted, not slept through. */
function fakeTimers() {
  let clock = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: ReplayTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: clock + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      pending.delete(id);
    },
  };
  return {
    timers,
    /** Advance time, firing anything due. */
    async advance(ms: number) {
      clock += ms;
      for (const [id, entry] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (entry.at <= clock) {
          pending.delete(id);
          entry.fn();
          // Let the generator's continuation run.
          await Promise.resolve();
          await Promise.resolve();
        }
      }
    },
    get scheduled() {
      return [...pending.values()].map((p) => p.at - clock);
    },
  };
}

const at = (seq: number, ts: number): WireFrame => [seq, ts, 0, 1, 0];

/** Three batches at t=0, t=100 and t=300 (20ms windows). */
const recording: Recording = {
  version: 1,
  meta: { instruments: 1 },
  frames: [at(0, 1000), at(1, 1005), at(2, 1100), at(3, 1300), at(4, 1310)],
};

/**
 * Pull the next batch, resolving to `null` if it has not arrived once the
 * microtask queue has drained. The pending `next()` stays queued on the
 * generator and is satisfied by whatever releases it later.
 */
async function poll<T>(iterator: AsyncIterator<T>): Promise<T | null> {
  const unsettled = Symbol('unsettled');
  const later = Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => unsettled);
  const outcome = await Promise.race([iterator.next(), later]);
  if (typeof outcome === 'symbol' || outcome.done) return null;
  return outcome.value;
}

describe('batchRecording', () => {
  it('groups frames by timestamp window and records the window offset', () => {
    const batches = batchRecording(recording.frames, 20);
    expect(batches.map((b) => [b.at, b.frames.length])).toEqual([
      [0, 2],
      [100, 1],
      [300, 2],
    ]);
  });

  it('is empty for an empty recording', () => {
    expect(batchRecording([], 20)).toEqual([]);
  });
});

describe('createReplaySource', () => {
  it('paces batches by their timestamp gaps at 1x', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 1, timers: clock.timers });
    const iterator = source.connect()[Symbol.asyncIterator]();

    // First batch is at offset 0: no wait.
    const pull1 = iterator.next();
    await clock.advance(0);
    expect((await pull1).value).toHaveLength(2);

    const pull2 = iterator.next();
    await Promise.resolve();
    expect(clock.scheduled).toEqual([100]);
    await clock.advance(100);
    expect((await pull2).value).toHaveLength(1);

    const pull3 = iterator.next();
    await Promise.resolve();
    expect(clock.scheduled).toEqual([200]);
    await clock.advance(200);
    expect((await pull3).value).toHaveLength(2);

    expect((await iterator.next()).done).toBe(true);
    expect(source.position).toBe(3);
    expect(source.total).toBe(3);
  });

  it('divides the gaps by the speed', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 10, timers: clock.timers });
    const iterator = source.connect()[Symbol.asyncIterator]();
    const first = iterator.next();
    await clock.advance(0);
    await first;
    void iterator.next();
    await Promise.resolve();
    expect(clock.scheduled).toEqual([10]);
  });

  it('in step mode, waits for step() and ignores the clock', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 'step', timers: clock.timers });
    const iterator = source.connect()[Symbol.asyncIterator]();

    expect(await poll(iterator)).toBeNull();
    expect(clock.scheduled).toEqual([]);
    source.step();
    await clock.advance(0);
    expect(source.position).toBe(1);
  });

  it('close() ends a pending wait', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 1, timers: clock.timers });
    const iterator = source.connect()[Symbol.asyncIterator]();
    const first = iterator.next();
    await clock.advance(0);
    await first;
    const pending = iterator.next();
    await Promise.resolve();
    source.close();
    expect((await pending).done).toBe(true);
    expect(clock.scheduled).toEqual([]);
  });

  it('breaking out of the loop clears the timer', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 1, timers: clock.timers });
    const iterable = source.connect();
    let count = 0;
    const loop = (async () => {
      for await (const batch of iterable) {
        count += batch.length;
        break;
      }
    })();
    await clock.advance(0);
    await loop;
    expect(count).toBe(2);
    expect(clock.scheduled).toEqual([]);
  });

  it('loops back to the start when asked', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, {
      speed: 100,
      loop: true,
      timers: clock.timers,
    });
    const iterator = source.connect()[Symbol.asyncIterator]();
    for (let i = 0; i < 4; i++) {
      const pull = iterator.next();
      await clock.advance(5);
      expect((await pull).done).toBe(false);
    }
    expect(source.position).toBe(4);
    source.close();
  });

  it('switching out of step mode mid-wait resumes playback', async () => {
    const clock = fakeTimers();
    const source = createReplaySource(recording, { speed: 'step', timers: clock.timers });
    const iterator = source.connect()[Symbol.asyncIterator]();
    const pending = iterator.next();
    await Promise.resolve();
    source.setSpeed(100);
    expect(clock.scheduled).toEqual([0]);
    await clock.advance(0);
    expect((await pending).done).toBe(false);
  });

  it('is single-use', () => {
    const source = createReplaySource(recording, { speed: 1 });
    source.connect();
    expect(() => source.connect()).toThrow(/single-use/);
    source.close();
  });

  it('completes immediately for an empty recording', async () => {
    const source = createReplaySource({ ...recording, frames: [] }, { speed: 1 });
    const iterator = source.connect()[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(true);
  });
});
