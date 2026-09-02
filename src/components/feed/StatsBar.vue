<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PipelineStats } from '@/pipeline/useTelemetryPipeline';

/**
 * The numbers that make the thesis visible: events per second on the left,
 * commits per second next to it, and the row count that stays flat no matter
 * what the first two do.
 */
const props = defineProps<{ stats: PipelineStats; rendered: number; total: number }>();

const { t, n } = useI18n();

const rejected = computed(
  () =>
    props.stats.malformed +
    props.stats.duplicate +
    props.stats.stale +
    props.stats.unknownInstrument,
);

const items = computed(() => [
  {
    key: 'eventsPerSecond',
    value: n(Math.round(props.stats.eventsPerSecond), 'integer'),
  },
  {
    key: 'commitsPerSecond',
    value: n(Math.round(props.stats.commitsPerSecond), 'integer'),
  },
  { key: 'lastBatch', value: n(props.stats.lastBatch, 'integer') },
  { key: 'maxBatch', value: n(props.stats.maxBatch, 'integer') },
  { key: 'dropped', value: n(props.stats.dropped, 'integer') },
  { key: 'rejected', value: n(rejected.value, 'integer') },
  {
    key: 'rendered',
    value: `${n(props.rendered, 'integer')} / ${n(props.total, 'integer')}`,
  },
]);
</script>

<template>
  <dl
    class="stats"
    :title="t('stats.help')"
    :data-events="stats.flushed"
    :data-commits="stats.commits"
    :data-dropped="stats.dropped"
  >
    <div v-for="item in items" :key="item.key" class="stats__item" :data-stat="item.key">
      <dt>{{ t(`stats.${item.key}`) }}</dt>
      <dd>{{ item.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-6);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-variant-numeric: tabular-nums;
}

.stats__item {
  display: flex;
  flex-direction: column;
  min-width: 6rem;
}

dt {
  font-size: 0.75rem;
  color: var(--text-muted);
}

dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.05rem;
}
</style>
