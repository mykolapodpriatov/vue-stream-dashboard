<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import PlaybackControls from '@/components/feed/PlaybackControls.vue';
import StatsBar from '@/components/feed/StatsBar.vue';
import TelemetryTable from '@/components/feed/TelemetryTable.vue';
import { QUALITY_BY_CODE } from '@/domain/telemetry';
import { useFeedStore } from '@/stores/feed';

const feed = useFeedStore();
const router = useRouter();
const { t } = useI18n();
const rendered = ref(0);

function open(id: number): void {
  void router.push({ name: 'instrument', params: { id: String(id) } });
}
</script>

<template>
  <section class="feed">
    <h1>{{ t('feed.title') }}</h1>

    <div class="feed__toolbar">
      <PlaybackControls />
      <label class="feed__filter">
        <span>{{ t('feed.search') }}</span>
        <input
          v-model="feed.query"
          type="search"
          :placeholder="t('feed.searchPlaceholder')"
        />
      </label>
      <label class="feed__filter">
        <span>{{ t('feed.qualityFilter') }}</span>
        <select v-model="feed.qualityFilter">
          <option value="all">{{ t('quality.all') }}</option>
          <option v-for="quality in QUALITY_BY_CODE" :key="quality" :value="quality">
            {{ t(`quality.${quality}`) }}
          </option>
        </select>
      </label>
    </div>

    <StatsBar
      :stats="feed.stats"
      :rendered="rendered"
      :total="feed.snapshot.rows.length"
    />

    <TelemetryTable
      :rows="feed.snapshot.rows"
      :order="feed.order"
      :sort-key="feed.sortKey"
      :sort-direction="feed.sortDirection"
      @sort="feed.sortBy"
      @select="open"
      @rendered="rendered = $event"
    />
  </section>
</template>

<style scoped>
.feed {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.feed__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.feed__filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.feed__filter input,
.feed__filter select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}
</style>
