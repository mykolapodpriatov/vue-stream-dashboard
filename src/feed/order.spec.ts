import { describe, expect, it } from 'vitest';
import type { Quality } from '@/domain/telemetry';
import { createTelemetryState, type InstrumentRow } from '@/pipeline/telemetryState';
import { computeOrder, type OrderCriteria } from './order';

function rows(
  readings: {
    id: number;
    value?: number;
    quality?: Quality;
    ts?: number;
    updates?: number;
  }[],
  count = 6,
): readonly InstrumentRow[] {
  const state = createTelemetryState(count);
  const events = readings.flatMap((r) =>
    Array.from({ length: r.updates ?? 1 }, (_, i) => ({
      seq: r.id * 100 + i,
      ts: r.ts ?? 1_000 + r.id,
      instrumentId: r.id,
      value: r.value ?? r.id,
      quality: r.quality ?? ('good' as const),
    })),
  );
  state.apply(events);
  return state.rows;
}

const base: OrderCriteria = {
  sortKey: 'id',
  direction: 'asc',
  query: '',
  quality: 'all',
};

describe('computeOrder', () => {
  it('is the identity for the default criteria', () => {
    expect(computeOrder(rows([], 4), base)).toEqual([0, 1, 2, 3]);
  });

  it('reverses for id descending', () => {
    expect(computeOrder(rows([], 3), { ...base, direction: 'desc' })).toEqual([2, 1, 0]);
  });

  it('filters by a case-insensitive name fragment', () => {
    // ids 0..5 → TMP, PRS, FLW, VIB, HUM, TMP
    expect(computeOrder(rows([], 6), { ...base, query: 'tmp' })).toEqual([0, 5]);
    expect(computeOrder(rows([], 6), { ...base, query: '  00003 ' })).toEqual([3]);
  });

  it('filters by quality', () => {
    const data = rows([
      { id: 0, quality: 'bad' },
      { id: 1, quality: 'good' },
      { id: 2, quality: 'bad' },
    ]);
    expect(computeOrder(data, { ...base, quality: 'bad' })).toEqual([0, 2]);
  });

  it('sorts by value with unread rows last in either direction', () => {
    const data = rows([
      { id: 0, value: 30 },
      { id: 2, value: 10 },
      { id: 3, value: 20 },
    ]);
    expect(computeOrder(data, { ...base, sortKey: 'value' })).toEqual([2, 3, 0, 1, 4, 5]);
    expect(computeOrder(data, { ...base, sortKey: 'value', direction: 'desc' })).toEqual([
      0, 3, 2, 1, 4, 5,
    ]);
  });

  it('sorts by quality rank, good first', () => {
    const data = rows([
      { id: 0, quality: 'suspect' },
      { id: 1, quality: 'bad' },
      { id: 2, quality: 'good' },
    ]);
    expect(computeOrder(data, { ...base, sortKey: 'quality' }).slice(0, 3)).toEqual([
      2, 0, 1,
    ]);
  });

  it('sorts by name, then by index for ties', () => {
    const data = rows([{ id: 0 }, { id: 1 }, { id: 5 }]);
    // Read rows first, alphabetically: PRS-00001 < TMP-00000 < TMP-00005. Then the
    // unread ones, also alphabetically: FLW-00002 < HUM-00004 < VIB-00003.
    expect(computeOrder(data, { ...base, sortKey: 'name' })).toEqual([1, 0, 5, 2, 4, 3]);
  });

  it('sorts by timestamp and by update count', () => {
    const data = rows([
      { id: 0, ts: 300, updates: 1 },
      { id: 1, ts: 100, updates: 3 },
      { id: 2, ts: 200, updates: 2 },
    ]);
    expect(
      computeOrder(data, { ...base, sortKey: 'ts', direction: 'desc' }).slice(0, 3),
    ).toEqual([0, 2, 1]);
    expect(
      computeOrder(data, { ...base, sortKey: 'updates', direction: 'desc' }).slice(0, 3),
    ).toEqual([1, 2, 0]);
  });

  it('combines filter and sort', () => {
    const data = rows([
      { id: 0, value: 5 },
      { id: 5, value: 1 },
    ]);
    expect(computeOrder(data, { ...base, query: 'TMP', sortKey: 'value' })).toEqual([
      5, 0,
    ]);
  });
});
