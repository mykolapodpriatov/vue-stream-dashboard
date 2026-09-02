<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import QualityBadge from '@/components/feed/QualityBadge.vue';
import SparklineChart from '@/components/feed/SparklineChart.vue';
import { useInstrumentHistory } from '@/composables/useInstrumentHistory';
import { describeInstrument } from '@/domain/telemetry';
import { useFeedStore } from '@/stores/feed';

const props = defineProps<{ id: string }>();

const feed = useFeedStore();
const { t, n, d } = useI18n();

const id = computed(() => Number(props.id));
const info = computed(() => describeInstrument(id.value));
/** Re-read per commit: the row object is stable, but the snapshot dependency is what re-renders us. */
const row = computed(() => feed.snapshot.rows[id.value]);
const points = useInstrumentHistory(id);

const total = computed(() => feed.snapshot.rows.length);
const previous = computed(() => (id.value > 0 ? id.value - 1 : null));
const next = computed(() => (id.value + 1 < total.value ? id.value + 1 : null));

const format = (value: number) =>
  n(value, {
    maximumFractionDigits: info.value.precision,
    minimumFractionDigits: info.value.precision,
  });

const chartLabel = computed(() => {
  const series = points.value;
  const last = series.at(-1);
  if (!last) return t('instrument.chartEmpty', { name: info.value.name });
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of series) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  return t('instrument.chart', {
    name: info.value.name,
    count: series.length,
    min: format(min),
    max: format(max),
    last: format(last.value),
    unit: info.value.unit,
  });
});
</script>

<template>
  <section class="instrument">
    <p>
      <RouterLink to="/">← {{ t('instrument.back') }}</RouterLink>
    </p>

    <template v-if="row">
      <header class="instrument__header">
        <h1 class="instrument__name">{{ row.name }}</h1>
        <p class="instrument__kind">{{ t(`kind.${row.kind}`) }}</p>
      </header>

      <div class="instrument__reading">
        <p class="instrument__label">{{ t('instrument.current') }}</p>
        <p class="instrument__value">
          <template v-if="row.updates > 0">
            <span class="instrument__number">{{ format(row.value) }}</span>
            <span class="instrument__unit">{{ ' ' + row.unit }}</span>
          </template>
          <span v-else class="instrument__muted">{{ t('feed.noReading') }}</span>
        </p>
        <QualityBadge v-if="row.updates > 0" :quality="row.quality" />
      </div>

      <dl class="instrument__meta">
        <div>
          <dt>{{ t('instrument.lastUpdate') }}</dt>
          <dd>{{ row.updates > 0 ? d(row.ts, 'time') : '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('instrument.updates') }}</dt>
          <dd>{{ n(row.updates, 'integer') }}</dd>
        </div>
      </dl>

      <figure class="instrument__chart">
        <SparklineChart :points="points" :label="chartLabel" />
        <figcaption>{{ t('instrument.history', { count: points.length }) }}</figcaption>
      </figure>

      <nav class="instrument__nav" :aria-label="t('instrument.navLabel')">
        <RouterLink
          v-if="previous !== null"
          :to="{ name: 'instrument', params: { id: String(previous) } }"
        >
          ← {{ t('instrument.previous') }}
        </RouterLink>
        <RouterLink
          v-if="next !== null"
          :to="{ name: 'instrument', params: { id: String(next) } }"
        >
          {{ t('instrument.next') }} →
        </RouterLink>
      </nav>
    </template>

    <template v-else>
      <h1>{{ info.name }}</h1>
      <p>{{ t('instrument.notFound', { id: props.id, count: n(total, 'integer') }) }}</p>
    </template>
  </section>
</template>

<style scoped>
.instrument {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 48rem;
}

.instrument__header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.instrument__name {
  margin: 0;
  font-family: var(--font-mono);
}

.instrument__kind {
  margin: 0;
  color: var(--text-muted);
}

.instrument__reading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.instrument__label {
  width: 100%;
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.instrument__value {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.instrument__number {
  font-family: var(--font-mono);
  font-size: 2.5rem;
}

.instrument__unit {
  margin-left: var(--space-2);
  color: var(--text-muted);
}

.instrument__muted {
  color: var(--text-muted);
}

.instrument__meta {
  display: flex;
  gap: var(--space-8);
  margin: 0;
}

.instrument__meta dt {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.instrument__meta dd {
  margin: 0;
  font-family: var(--font-mono);
}

.instrument__chart {
  margin: 0;
}

.instrument__chart figcaption {
  margin-top: var(--space-2);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.instrument__nav {
  display: flex;
  justify-content: space-between;
}
</style>
