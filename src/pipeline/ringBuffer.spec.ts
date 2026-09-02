import { describe, expect, it } from 'vitest';
import { createRingBuffer } from './ringBuffer';

describe('createRingBuffer', () => {
  it('drains in arrival order and empties itself', () => {
    const ring = createRingBuffer<number>(4);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    const out: number[] = [];
    expect(ring.drain(out)).toBe(3);
    expect(out).toEqual([1, 2, 3]);
    expect(ring.size).toBe(0);
    expect(ring.drain(out)).toBe(0);
  });

  it('overwrites the oldest item when full and counts the loss', () => {
    const ring = createRingBuffer<number>(3);
    for (const n of [1, 2, 3, 4, 5]) ring.push(n);
    expect(ring.size).toBe(3);
    expect(ring.dropped).toBe(2);
    const out: number[] = [];
    ring.drain(out);
    expect(out).toEqual([3, 4, 5]);
  });

  it('keeps order correct across many wrap-arounds', () => {
    const ring = createRingBuffer<number>(5);
    const out: number[] = [];
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 7; i++) ring.push(round * 100 + i);
      out.length = 0;
      ring.drain(out);
      expect(out).toEqual([2, 3, 4, 5, 6].map((i) => round * 100 + i));
    }
    expect(ring.dropped).toBe(20);
  });

  it('appends to the array it is given', () => {
    const ring = createRingBuffer<string>(2);
    ring.push('b');
    const out = ['a'];
    ring.drain(out);
    expect(out).toEqual(['a', 'b']);
  });

  it('clear discards without counting as dropped', () => {
    const ring = createRingBuffer<number>(2);
    ring.push(1);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.dropped).toBe(0);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => createRingBuffer(0)).toThrow(RangeError);
    expect(() => createRingBuffer(1.5)).toThrow(RangeError);
  });
});
