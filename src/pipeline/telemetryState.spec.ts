import { describe, expect, it } from 'vitest';
import type { TelemetryEvent } from '@/domain/telemetry';
import { createTelemetryState } from './telemetryState';

const event = (instrumentId: number, value: number, seq = 0): TelemetryEvent => ({
  seq,
  ts: 1_000 + seq,
  instrumentId,
  value,
  quality: 'good',
});

describe('createTelemetryState', () => {
  it('starts every row empty, with NaN rather than zero', () => {
    const state = createTelemetryState(3);
    expect(state.rows).toHaveLength(3);
    expect(state.rows[1]).toMatchObject({ id: 1, name: 'PRS-00001', updates: 0 });
    expect(Number.isNaN(state.rows[1]!.value)).toBe(true);
  });

  it('applies events in place and remembers the previous value', () => {
    const state = createTelemetryState(2);
    const row = state.rows[0]!;
    state.apply([event(0, 10, 1), event(0, 12, 2)]);
    expect(state.rows[0]).toBe(row);
    expect(row).toMatchObject({ value: 12, previous: 10, ts: 1_002, updates: 2 });
  });

  it('reports each updated id once per snapshot, then clears the set', () => {
    const state = createTelemetryState(5);
    state.apply([event(3, 1), event(1, 1), event(3, 2)]);
    const first = state.snapshot(1, 16);
    expect(first.updated).toEqual([3, 1]);
    expect(first.frame).toBe(1);
    expect(first.at).toBe(16);

    const second = state.snapshot(2, 32);
    expect(second.updated).toEqual([]);
    // Same rows array across snapshots: a version marker, not a copy.
    expect(second.rows).toBe(first.rows);
  });

  it('tracks the highest sequence applied', () => {
    const state = createTelemetryState(2);
    expect(state.snapshot(0, 0).seq).toBe(-1);
    state.apply([event(0, 1, 7), event(1, 1, 3)]);
    expect(state.snapshot(1, 0).seq).toBe(7);
  });

  it('ignores and counts events for instruments outside the fleet', () => {
    const state = createTelemetryState(2);
    expect(state.apply([event(0, 1), event(9, 1), event(2, 1)])).toBe(2);
    expect(state.rows[0]!.updates).toBe(1);
  });

  it('resize replaces the fleet and forgets readings', () => {
    const state = createTelemetryState(2);
    state.apply([event(0, 5)]);
    state.resize(4);
    expect(state.rows).toHaveLength(4);
    expect(state.rows[0]!.updates).toBe(0);
    expect(state.snapshot(0, 0)).toMatchObject({ updated: [], seq: -1 });
  });

  it('rejects an empty fleet', () => {
    expect(() => createTelemetryState(0)).toThrow(RangeError);
  });
});
