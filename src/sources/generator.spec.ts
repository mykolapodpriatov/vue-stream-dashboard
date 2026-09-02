import { describe, expect, it } from 'vitest';
import { instrumentSpec, QUALITY_BY_CODE } from '@/domain/telemetry';
import { createTelemetryGenerator } from './generator';

const base = {
  seed: 1,
  instruments: 100,
  ratePerSecond: 1_000,
  startTs: 1_700_000_000_000,
};

describe('createTelemetryGenerator', () => {
  it('produces the configured rate, carrying fractions across ticks', () => {
    const generator = createTelemetryGenerator({ ...base, ratePerSecond: 333 });
    let total = 0;
    for (let i = 0; i < 50; i++) total += generator.advance(20).length;
    // 333/s over one second: exactly 333, not 300 from flooring each tick.
    expect(total).toBe(333);
  });

  it('is deterministic for a seed and diverges across seeds', () => {
    const a = createTelemetryGenerator(base).advance(100);
    const b = createTelemetryGenerator(base).advance(100);
    const c = createTelemetryGenerator({ ...base, seed: 2 }).advance(100);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('issues consecutive sequence numbers and increasing timestamps', () => {
    const generator = createTelemetryGenerator(base);
    const frames = [...generator.advance(50), ...generator.advance(50)];
    frames.forEach((frame, index) => {
      expect(frame[0]).toBe(index);
    });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]![1]).toBeGreaterThanOrEqual(frames[i - 1]![1]);
    }
    expect(frames[0]![1]).toBeGreaterThan(base.startTs);
    expect(frames.at(-1)![1]).toBeLessThanOrEqual(base.startTs + 100);
  });

  it('keeps every reading inside its instrument range', () => {
    const generator = createTelemetryGenerator({ ...base, ratePerSecond: 20_000 });
    for (const [, , id, value] of generator.advance(1_000)) {
      const spec = instrumentSpec(id);
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('only addresses instruments in the fleet', () => {
    const generator = createTelemetryGenerator({ ...base, instruments: 7 });
    const ids = new Set(generator.advance(2_000).map((frame) => frame[2]));
    expect(Math.max(...ids)).toBeLessThan(7);
    expect(ids.size).toBe(7);
  });

  it('flags a small, realistic share of readings as suspect or bad', () => {
    const generator = createTelemetryGenerator({ ...base, ratePerSecond: 50_000 });
    const frames = generator.advance(1_000);
    const bad =
      frames.filter((f) => f[4] === QUALITY_BY_CODE.indexOf('bad')).length /
      frames.length;
    const suspect =
      frames.filter((f) => f[4] === QUALITY_BY_CODE.indexOf('suspect')).length /
      frames.length;
    expect(bad).toBeGreaterThan(0.001);
    expect(bad).toBeLessThan(0.01);
    expect(suspect).toBeGreaterThan(0.02);
    expect(suspect).toBeLessThan(0.05);
  });

  it('emits a clean wire unless asked otherwise', () => {
    const frames = createTelemetryGenerator({ ...base, ratePerSecond: 50_000 }).advance(
      1_000,
    );
    const seqs = frames.map((f) => f[0]);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(frames.every((f) => Number.isFinite(f[3]) && f[4] <= 2)).toBe(true);
  });

  it('with dirtyWire, injects duplicates, reorders, NaN and unknown codes', () => {
    const generator = createTelemetryGenerator({
      ...base,
      ratePerSecond: 50_000,
      dirtyWire: true,
    });
    const frames = generator.advance(2_000);
    const seqs = frames.map((f) => f[0]);
    const duplicates = seqs.length - new Set(seqs).size;
    const reordered = seqs.filter((seq, i) => i > 0 && seq < seqs[i - 1]!).length;
    const nans = frames.filter((f) => Number.isNaN(f[3])).length;
    const badCodes = frames.filter((f) => f[4] > 2).length;
    expect(duplicates).toBeGreaterThan(0);
    expect(reordered).toBeGreaterThan(0);
    expect(nans).toBeGreaterThan(0);
    expect(badCodes).toBeGreaterThan(0);
    // Dirt is the exception, not the rule.
    expect(duplicates + reordered + nans + badCodes).toBeLessThan(frames.length * 0.02);
  });

  it('changes rate without resetting state', () => {
    const generator = createTelemetryGenerator(base);
    generator.advance(100);
    const seqBefore = generator.seq;
    generator.setRate(10_000);
    const burst = generator.advance(100);
    expect(burst.length).toBe(1_000);
    expect(burst[0]![0]).toBe(seqBefore);
  });

  it('returns nothing for a non-positive elapsed time', () => {
    const generator = createTelemetryGenerator(base);
    expect(generator.advance(0)).toEqual([]);
    expect(generator.advance(-5)).toEqual([]);
  });

  it('rejects an empty fleet', () => {
    expect(() => createTelemetryGenerator({ ...base, instruments: 0 })).toThrow(
      RangeError,
    );
  });
});
