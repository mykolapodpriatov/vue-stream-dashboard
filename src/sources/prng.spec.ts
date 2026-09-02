import { describe, expect, it } from 'vitest';
import { createPrng } from './prng';

describe('createPrng', () => {
  it('is deterministic for a seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    const left = Array.from({ length: 50 }, () => a.next());
    const right = Array.from({ length: 50 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('diverges for different seeds', () => {
    const a = createPrng(1);
    const b = createPrng(2);
    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
  });

  it('stays within [0, 1) and looks roughly uniform', () => {
    const rng = createPrng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)]! += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(1_700);
      expect(count).toBeLessThan(2_300);
    }
  });

  it('int() covers the whole range and nothing outside it', () => {
    const rng = createPrng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const value = rng.int(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('gaussian() has mean ≈ 0 and deviation ≈ 1', () => {
    const rng = createPrng(11);
    const n = 20_000;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < n; i++) {
      const value = rng.gaussian();
      sum += value;
      squares += value * value;
    }
    const mean = sum / n;
    const deviation = Math.sqrt(squares / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(deviation - 1)).toBeLessThan(0.05);
  });

  it('treats a zero seed as a valid seed rather than a broken generator', () => {
    const rng = createPrng(0);
    const values = new Set(Array.from({ length: 20 }, () => rng.next()));
    expect(values.size).toBe(20);
  });
});
