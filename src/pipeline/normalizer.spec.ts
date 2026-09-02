import { describe, expect, it } from 'vitest';
import { createNormalizer } from './normalizer';

const frame = (seq: number, overrides: Partial<Record<1 | 2 | 3 | 4, unknown>> = {}) => [
  seq,
  overrides[1] ?? 1_000 + seq,
  overrides[2] ?? 3,
  overrides[3] ?? 42.5,
  overrides[4] ?? 0,
];

describe('createNormalizer', () => {
  it('turns a valid frame into a typed event', () => {
    const normalizer = createNormalizer();
    expect(normalizer.normalize([7, 1_700_000_000_007, 12, 3.25, 1])).toEqual({
      seq: 7,
      ts: 1_700_000_000_007,
      instrumentId: 12,
      value: 3.25,
      quality: 'suspect',
    });
    expect(normalizer.stats.accepted).toBe(1);
  });

  it.each([
    ['not an array', 'nope'],
    ['too short', [1, 2, 3, 4]],
    ['too long', [1, 2, 3, 4, 5, 6]],
    ['a fractional seq', frame(1.5)],
    ['a negative seq', frame(-1)],
    ['a non-finite timestamp', frame(1, { 1: Number.POSITIVE_INFINITY })],
    ['a fractional instrument id', frame(1, { 2: 2.5 })],
    ['a negative instrument id', frame(1, { 2: -3 })],
    ['a NaN value', frame(1, { 3: Number.NaN })],
    ['a string value', frame(1, { 3: '42' })],
    ['an unknown quality code', frame(1, { 4: 7 })],
    ['a fractional quality code', frame(1, { 4: 0.5 })],
  ])('rejects %s as malformed', (_label, input) => {
    const normalizer = createNormalizer();
    expect(normalizer.normalize(input)).toBeNull();
    expect(normalizer.stats.malformed).toBe(1);
    expect(normalizer.stats.accepted).toBe(0);
  });

  it('drops an exact duplicate and counts it', () => {
    const normalizer = createNormalizer();
    expect(normalizer.normalize(frame(5))).not.toBeNull();
    expect(normalizer.normalize(frame(5))).toBeNull();
    expect(normalizer.stats).toMatchObject({ accepted: 1, duplicate: 1 });
  });

  it('accepts a late frame, counts the reorder and closes the gap', () => {
    const normalizer = createNormalizer();
    normalizer.normalize(frame(1));
    normalizer.normalize(frame(3));
    expect(normalizer.stats.gaps).toBe(1);
    expect(normalizer.normalize(frame(2))).not.toBeNull();
    expect(normalizer.stats).toMatchObject({ accepted: 3, reordered: 1, gaps: 0 });
  });

  it('counts frames that never arrive as gaps', () => {
    const normalizer = createNormalizer();
    normalizer.normalize(frame(0));
    normalizer.normalize(frame(10));
    expect(normalizer.stats.gaps).toBe(9);
  });

  it('does not count a gap before the first frame', () => {
    const normalizer = createNormalizer();
    normalizer.normalize(frame(500));
    expect(normalizer.stats.gaps).toBe(0);
  });

  it('drops frames older than the window as stale rather than trusting them', () => {
    const normalizer = createNormalizer({ window: 8 });
    normalizer.normalize(frame(100));
    expect(normalizer.normalize(frame(92))).toBeNull();
    expect(normalizer.stats.stale).toBe(1);
    // Inside the window: fine.
    expect(normalizer.normalize(frame(93))).not.toBeNull();
  });

  it('still detects a duplicate whose slot was reused by a newer seq', () => {
    const normalizer = createNormalizer({ window: 4 });
    normalizer.normalize(frame(1));
    normalizer.normalize(frame(5)); // same slot as 1 (5 % 4 === 1)
    // 1 is now outside the window → stale, not silently accepted.
    expect(normalizer.normalize(frame(1))).toBeNull();
    expect(normalizer.stats.stale).toBe(1);
    expect(normalizer.normalize(frame(5))).toBeNull();
    expect(normalizer.stats.duplicate).toBe(1);
  });

  it('forgetSequence keeps the counters but accepts old seqs again', () => {
    const normalizer = createNormalizer();
    normalizer.normalize(frame(5));
    normalizer.normalize(frame(5));
    normalizer.forgetSequence();
    expect(normalizer.normalize(frame(5))).not.toBeNull();
    expect(normalizer.stats).toMatchObject({ accepted: 2, duplicate: 1 });
  });

  it('reset forgets sequence history', () => {
    const normalizer = createNormalizer();
    normalizer.normalize(frame(5));
    normalizer.reset();
    expect(normalizer.normalize(frame(5))).not.toBeNull();
    expect(normalizer.stats).toEqual({
      accepted: 1,
      malformed: 0,
      duplicate: 0,
      stale: 0,
      reordered: 0,
      gaps: 0,
    });
  });
});
