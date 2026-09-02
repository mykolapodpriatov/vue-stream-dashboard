import { describe, expect, it } from 'vitest';
import {
  createLiveWorkerController,
  type WorkerEvent,
  type WorkerTimers,
} from './liveWorkerCore';

/** Hand-driven timers: the test decides when a tick happens and what time it is. */
function fakeTimers() {
  let clock = 0;
  let handler: (() => void) | null = null;
  let cleared = 0;
  const timers: WorkerTimers = {
    setInterval: (fn) => {
      handler = fn;
      return 1;
    },
    clearInterval: () => {
      handler = null;
      cleared += 1;
    },
    now: () => clock,
  };
  return {
    timers,
    tick(ms: number) {
      clock += ms;
      handler?.();
    },
    get armed() {
      return handler !== null;
    },
    get cleared() {
      return cleared;
    },
  };
}

function harness() {
  const posted: WorkerEvent[] = [];
  const clock = fakeTimers();
  const controller = createLiveWorkerController(
    { postMessage: (m) => posted.push(m) },
    clock.timers,
  );
  const config = { seed: 1, instruments: 10, ratePerSecond: 1_000, startTs: 0 };
  return { posted, clock, controller, config };
}

describe('createLiveWorkerController', () => {
  it('announces open on start and posts a batch per tick', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    expect(posted).toEqual([{ type: 'open' }]);

    clock.tick(20);
    clock.tick(20);
    const batches = posted.filter((m) => m.type === 'batch');
    expect(batches).toHaveLength(2);
    // 1000/s over 20ms ticks: 20 frames each.
    expect(batches.every((b) => b.frames.length === 20)).toBe(true);
  });

  it('does nothing on a tick before start', () => {
    const { posted, clock } = harness();
    clock.tick(20);
    expect(posted).toEqual([]);
  });

  it('applies a rate change on the next tick', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.handle({ type: 'configure', ratePerSecond: 5_000 });
    clock.tick(20);
    const batch = posted.find((m) => m.type === 'batch');
    expect(batch?.type === 'batch' && batch.frames.length).toBe(100);
  });

  it('stop clears the interval and announces closed', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.handle({ type: 'stop' });
    expect(clock.armed).toBe(false);
    expect(posted.at(-1)).toEqual({ type: 'closed', reason: 'stopped' });
    // A second stop is a no-op, not a second closed message.
    controller.handle({ type: 'stop' });
    expect(posted.filter((m) => m.type === 'closed')).toHaveLength(1);
  });

  it('a stall keeps the connection open and silent', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.handle({ type: 'fault', fault: 'stall' });
    clock.tick(20);
    clock.tick(20);
    expect(posted).toEqual([{ type: 'open' }]);
    expect(clock.armed).toBe(true);

    // Lifting the stall resumes delivery with a coherent sequence — the
    // frames generated while stalled are gone, as they would be on a real
    // dead socket.
    controller.handle({ type: 'fault', fault: 'none' });
    clock.tick(20);
    const batch = posted.at(-1);
    expect(batch?.type).toBe('batch');
    expect(batch?.type === 'batch' && batch.frames[0]?.[0]).toBe(40);
  });

  it('a drop closes with the fault as the reason', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.handle({ type: 'fault', fault: 'drop' });
    expect(posted.at(-1)).toEqual({ type: 'closed', reason: 'fault' });
    expect(clock.armed).toBe(false);
  });

  it('a second start replaces the first without a closed message in between', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.handle({ type: 'start', config: { ...config, seed: 2 }, tickMs: 20 });
    expect(posted).toEqual([{ type: 'open' }, { type: 'open' }]);
    expect(clock.cleared).toBe(1);
  });

  it('dispose stops the timer silently', () => {
    const { posted, clock, controller, config } = harness();
    controller.handle({ type: 'start', config, tickMs: 20 });
    controller.dispose();
    expect(clock.armed).toBe(false);
    expect(posted).toEqual([{ type: 'open' }]);
  });
});
