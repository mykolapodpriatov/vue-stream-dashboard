import { shallowRef, toValue, watch, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { useFeedStore } from '@/stores/feed';

export interface HistoryPoint {
  readonly ts: number;
  readonly value: number;
}

/**
 * The recent values of one instrument, sampled from the committed snapshot.
 *
 * Deliberately once per frame, not once per event. Between two commits an
 * instrument may receive several readings and only the last survives into the
 * row; the chart shows what the table shows, at the cadence the table shows
 * it. Sampling per event would mean a second data path with its own buffer,
 * for a difference no eye can see at 60 Hz.
 *
 * Bounded: the array is replaced, not pushed to, so the chart's `watch` fires
 * on identity and `capacity` caps the memory of an instrument left open for
 * an hour.
 */
export function useInstrumentHistory(
  id: MaybeRefOrGetter<number>,
  capacity = 300,
): ShallowRef<readonly HistoryPoint[]> {
  const feed = useFeedStore();
  const points = shallowRef<readonly HistoryPoint[]>([]);

  watch(
    () => toValue(id),
    () => {
      points.value = [];
    },
  );

  watch(
    () => feed.snapshot,
    (snapshot) => {
      const target = toValue(id);
      if (!snapshot.updated.includes(target)) return;
      const row = snapshot.rows[target];
      if (!row || row.updates === 0) return;
      const next =
        points.value.length >= capacity ? points.value.slice(1) : [...points.value];
      next.push({ ts: row.ts, value: row.value });
      points.value = next;
    },
  );

  return points;
}
