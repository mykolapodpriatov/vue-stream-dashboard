import { describe, expect, it } from 'vitest';
import { createRateMeter } from './rateMeter';

describe('createRateMeter', () => {
  it('reports items per second over the window', () => {
    const meter = createRateMeter(1000);
    meter.sample(100, 50);
    meter.sample(500, 50);
    expect(meter.rate(900)).toBe(100);
  });

  it('forgets samples that fall out of the window', () => {
    const meter = createRateMeter(1000);
    meter.sample(0, 100);
    meter.sample(600, 20);
    expect(meter.rate(1000)).toBe(20);
    expect(meter.rate(1700)).toBe(0);
  });

  it('scales to the window length', () => {
    const meter = createRateMeter(500);
    meter.sample(100, 10);
    expect(meter.rate(200)).toBe(20);
  });

  it('reset clears everything', () => {
    const meter = createRateMeter();
    meter.sample(10, 10);
    meter.reset();
    expect(meter.rate(20)).toBe(0);
  });
});
