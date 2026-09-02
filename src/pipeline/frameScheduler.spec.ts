import { describe, expect, it, vi } from 'vitest';
import { animationFrameScheduler, createManualScheduler } from './frameScheduler';

describe('createManualScheduler', () => {
  it('runs requested callbacks on tick, in order, with the frame time', () => {
    const scheduler = createManualScheduler();
    const calls: [string, number][] = [];
    scheduler.request((now) => calls.push(['a', now]));
    scheduler.request((now) => calls.push(['b', now]));
    expect(scheduler.pending).toBe(2);
    scheduler.tick(100);
    expect(calls).toEqual([
      ['a', 100],
      ['b', 100],
    ]);
    expect(scheduler.pending).toBe(0);
  });

  it('defers a callback requested during a tick to the next tick', () => {
    const scheduler = createManualScheduler();
    const calls: number[] = [];
    scheduler.request(() => {
      calls.push(1);
      scheduler.request(() => calls.push(2));
    });
    scheduler.tick();
    expect(calls).toEqual([1]);
    scheduler.tick();
    expect(calls).toEqual([1, 2]);
  });

  it('cancel removes a pending callback', () => {
    const scheduler = createManualScheduler();
    const spy = vi.fn();
    const handle = scheduler.request(spy);
    scheduler.cancel(handle);
    scheduler.tick();
    expect(spy).not.toHaveBeenCalled();
  });

  it('advances by one 60 Hz frame when no time is given', () => {
    const scheduler = createManualScheduler();
    scheduler.tick();
    scheduler.tick();
    expect(scheduler.now).toBeCloseTo(2000 / 60, 6);
  });
});

describe('animationFrameScheduler', () => {
  it('delegates to requestAnimationFrame and cancelAnimationFrame', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const callback = () => {};
    expect(animationFrameScheduler.request(callback)).toBe(42);
    expect(raf).toHaveBeenCalledWith(callback);
    animationFrameScheduler.cancel(42);
    expect(caf).toHaveBeenCalledWith(42);
    raf.mockRestore();
    caf.mockRestore();
  });
});
