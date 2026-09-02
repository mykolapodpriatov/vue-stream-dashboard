import type { Quality } from '@/domain/telemetry';
import type { InstrumentRow } from '@/pipeline/telemetryState';

export type SortKey = 'id' | 'name' | 'value' | 'ts' | 'quality' | 'updates';
export type SortDirection = 'asc' | 'desc';
export const SORT_KEYS: readonly SortKey[] = [
  'id',
  'name',
  'value',
  'ts',
  'quality',
  'updates',
];

export interface OrderCriteria {
  readonly sortKey: SortKey;
  readonly direction: SortDirection;
  /** Case-insensitive substring of the instrument name. */
  readonly query: string;
  readonly quality: Quality | 'all';
}

const QUALITY_RANK: Readonly<Record<Quality, number>> = { good: 0, suspect: 1, bad: 2 };

/**
 * Which rows to show, in what order — as an array of indexes into `rows`.
 *
 * This is the most expensive thing that happens per frame: sorting ten
 * thousand entries is a millisecond or two, and it has to happen on every
 * commit when the sort key is one that the data changes. Two things keep it
 * honest:
 *
 * - it sorts an **index array**, never the rows, so nothing the pipeline owns
 *   is touched or copied;
 * - the default — by id, ascending, no filter — is the identity and skips the
 *   sort entirely.
 *
 * Rows with no reading yet (`NaN` value, `ts` 0) sort last in either direction,
 * because "unknown" is not smaller than every number.
 */
export function computeOrder(
  rows: readonly InstrumentRow[],
  criteria: OrderCriteria,
): readonly number[] {
  const { sortKey, direction, quality } = criteria;
  const query = criteria.query.trim().toUpperCase();
  const filtered = query === '' && quality === 'all';

  let indexes: number[];
  if (filtered) {
    indexes = Array.from({ length: rows.length }, (_, i) => i);
  } else {
    indexes = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      if (quality !== 'all' && row.quality !== quality) continue;
      if (query !== '' && !row.name.includes(query)) continue;
      indexes.push(i);
    }
  }

  if (sortKey === 'id') {
    return direction === 'asc' ? indexes : indexes.reverse();
  }

  const sign = direction === 'asc' ? 1 : -1;
  const compare = comparator(sortKey);
  indexes.sort((a, b) => {
    const left = rows[a];
    const right = rows[b];
    if (!left || !right) return 0;
    // Unread rows go last regardless of direction.
    const leftEmpty = left.updates === 0;
    const rightEmpty = right.updates === 0;
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
    const result = compare(left, right);
    return result !== 0 ? result * sign : a - b;
  });
  return indexes;
}

function comparator(
  key: Exclude<SortKey, 'id'>,
): (a: InstrumentRow, b: InstrumentRow) => number {
  switch (key) {
    case 'name':
      return (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    case 'value':
      return (a, b) => a.value - b.value;
    case 'ts':
      return (a, b) => a.ts - b.ts;
    case 'quality':
      return (a, b) => QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality];
    case 'updates':
      return (a, b) => a.updates - b.updates;
  }
}
