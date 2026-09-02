<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import VirtualList from '@/components/virtual/VirtualList.vue';
import type { SortDirection, SortKey } from '@/feed/order';
import type { InstrumentRow } from '@/pipeline/telemetryState';
import QualityBadge from './QualityBadge.vue';

/**
 * The fleet as a virtualized grid. Presentational: rows and their order come
 * in as props, sorting and selection go out as events.
 *
 * Each row cell reads plain fields off a plain object. Nothing here is
 * reactive per row; the whole visible window re-renders when `order` changes
 * — once per commit — and that is the only dependency Vue tracks.
 */
const props = defineProps<{
  rows: readonly InstrumentRow[];
  order: readonly number[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  /** Pin the grid height (tests, fixed layouts). */
  viewportHeight?: number | undefined;
}>();

const emit = defineEmits<{
  sort: [key: SortKey];
  select: [id: number];
  rendered: [count: number];
}>();

const { t, n, d } = useI18n();

const ROW_HEIGHT = 40;
const list = useTemplateRef<InstanceType<typeof VirtualList>>('list');

const rendered = computed(() => list.value?.rendered ?? 0);
watch(
  rendered,
  (count) => {
    emit('rendered', count);
  },
  { immediate: true },
);

interface Column {
  readonly key: 'name' | 'kind' | 'value' | 'trend' | 'quality' | 'updated' | 'updates';
  /** Which sort key the header toggles. Absent for columns that cannot be sorted. */
  readonly sort?: SortKey;
}

/** One entry per cell in a row, in the same order — the header *is* the row template. */
const COLUMNS: readonly Column[] = [
  { key: 'name', sort: 'id' },
  // The name prefix encodes the kind, so sorting by name groups the fleet by kind.
  { key: 'kind', sort: 'name' },
  { key: 'value', sort: 'value' },
  { key: 'trend' },
  { key: 'quality', sort: 'quality' },
  { key: 'updated', sort: 'ts' },
  { key: 'updates', sort: 'updates' },
];

const columns = computed(() =>
  COLUMNS.map((column) => ({
    ...column,
    label: t(`feed.columns.${column.key}`),
    ariaSort:
      column.sort === undefined
        ? undefined
        : column.sort === props.sortKey
          ? props.sortDirection === 'asc'
            ? ('ascending' as const)
            : ('descending' as const)
          : ('none' as const),
  })),
);

function rowAt(index: number): InstrumentRow | undefined {
  const rowIndex = props.order[index];
  return rowIndex === undefined ? undefined : props.rows[rowIndex];
}

function trend(row: InstrumentRow): { glyph: string; label: string } {
  if (row.updates < 2 || Number.isNaN(row.previous)) return { glyph: '', label: '' };
  if (row.value > row.previous) return { glyph: '▲', label: t('feed.trendUp') };
  if (row.value < row.previous) return { glyph: '▼', label: t('feed.trendDown') };
  return { glyph: '—', label: t('feed.trendFlat') };
}

function formatValue(row: InstrumentRow): string {
  if (row.updates === 0) return '—';
  return n(row.value, {
    maximumFractionDigits: row.precision,
    minimumFractionDigits: row.precision,
  });
}

function onSelect(index: number): void {
  const row = rowAt(index);
  if (row) emit('select', row.id);
}
</script>

<template>
  <VirtualList
    ref="list"
    class="table"
    :count="order.length"
    :item-height="ROW_HEIGHT"
    :label="t('feed.table')"
    :viewport-height="viewportHeight"
    :row-id="(index: number) => `instrument-row-${order[index] ?? index}`"
    @select="onSelect"
  >
    <template #header>
      <div class="table__row table__row--header" role="row">
        <div
          v-for="column in columns"
          :key="column.key"
          role="columnheader"
          class="table__cell"
          :class="`table__cell--${column.key}`"
          :aria-sort="column.ariaSort"
        >
          <button
            v-if="column.sort"
            type="button"
            class="table__sort"
            :aria-label="t('feed.sortBy', { column: column.label })"
            @click="emit('sort', column.sort)"
          >
            {{ column.label }}
            <span v-if="column.ariaSort && column.ariaSort !== 'none'" aria-hidden="true">
              {{ column.ariaSort === 'ascending' ? '↑' : '↓' }}
            </span>
          </button>
          <span v-else>{{ column.label }}</span>
        </div>
      </div>
    </template>

    <template #row="{ index }">
      <div v-if="rowAt(index)" class="table__row" role="presentation">
        <div class="table__cell table__cell--name" role="gridcell">
          <span class="table__name">{{ rowAt(index)!.name }}</span>
        </div>
        <div class="table__cell table__cell--kind" role="gridcell">
          {{ t(`kind.${rowAt(index)!.kind}`) }}
        </div>
        <div class="table__cell table__cell--value" role="gridcell">
          <span v-if="rowAt(index)!.updates === 0" class="table__muted">{{
            t('feed.noReading')
          }}</span>
          <template v-else>
            <span class="table__number">{{ formatValue(rowAt(index)!) }}</span>
            <span class="table__unit">{{ ' ' + rowAt(index)!.unit }}</span>
          </template>
        </div>
        <div class="table__cell table__cell--trend" role="gridcell">
          <span
            :aria-label="trend(rowAt(index)!).label || undefined"
            :title="trend(rowAt(index)!).label"
          >
            {{ trend(rowAt(index)!).glyph }}
          </span>
        </div>
        <div class="table__cell table__cell--quality" role="gridcell">
          <QualityBadge
            v-if="rowAt(index)!.updates > 0"
            :quality="rowAt(index)!.quality"
          />
        </div>
        <div class="table__cell table__cell--updated" role="gridcell">
          <span v-if="rowAt(index)!.updates > 0" class="table__number">
            {{ d(rowAt(index)!.ts, 'time') }}
          </span>
        </div>
        <div class="table__cell table__cell--updates" role="gridcell">
          <span class="table__number">{{ n(rowAt(index)!.updates, 'integer') }}</span>
        </div>
      </div>
    </template>

    <template #empty>{{ t('feed.empty') }}</template>
  </VirtualList>
</template>

<style scoped>
.table {
  --columns: minmax(8rem, 1.2fr) minmax(7rem, 1fr) minmax(8rem, 1fr) 3.5rem
    minmax(7rem, 1fr) 6rem 6rem;
  height: min(70vh, 720px);
  font-variant-numeric: tabular-nums;
}

.table__row {
  display: grid;
  grid-template-columns: var(--columns);
  align-items: center;
  height: 100%;
  padding: 0 var(--space-2);
}

.table__row--header {
  height: 2.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.table__cell {
  padding: 0 var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table__cell--value,
.table__cell--updates {
  text-align: right;
}

.table__cell--trend {
  text-align: center;
}

.table__sort {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.table__cell[aria-sort='ascending'] .table__sort,
.table__cell[aria-sort='descending'] .table__sort {
  color: var(--text);
  font-weight: 600;
}

.table__name {
  font-family: var(--font-mono);
}

.table__number {
  font-family: var(--font-mono);
}

.table__unit {
  margin-left: var(--space-1);
  color: var(--text-muted);
  font-size: 0.85em;
}

.table__muted {
  color: var(--text-muted);
}
</style>
