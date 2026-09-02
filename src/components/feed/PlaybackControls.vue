<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { PLAYBACK_MODES } from '@/sources/playback';
import { useFeedStore } from '@/stores/feed';
import { RATES, useSettingsStore } from '@/stores/settings';

/**
 * Live and the four replay speeds as one radio group: switching from live to
 * a recording must feel like changing a speed, not changing an application.
 * Native radios, so the group is keyboard-navigable and announced for free.
 */
const feed = useFeedStore();
const settings = useSettingsStore();
const { t, n } = useI18n();

function onRate(event: Event): void {
  feed.setRate(Number((event.target as HTMLSelectElement).value));
}
</script>

<template>
  <div class="playback">
    <fieldset class="playback__modes">
      <legend class="visually-hidden">{{ t('playback.legend') }}</legend>
      <label v-for="option in PLAYBACK_MODES" :key="option" class="playback__mode">
        <input
          type="radio"
          name="playback-mode"
          :value="option"
          :checked="feed.mode === option"
          @change="feed.setMode(option)"
        />
        <span>{{ t(`playback.${option}`) }}</span>
      </label>
    </fieldset>

    <button
      v-if="feed.mode === 'step'"
      type="button"
      class="playback__button"
      data-action="step"
      @click="feed.step()"
    >
      {{ t('playback.stepOnce') }}
    </button>

    <button
      type="button"
      class="playback__button"
      data-action="pause"
      :aria-pressed="feed.paused"
      @click="feed.paused ? feed.resume() : feed.pause()"
    >
      {{ feed.paused ? t('playback.resume') : t('playback.pause') }}
    </button>

    <label v-if="feed.mode === 'live'" class="playback__rate">
      <span>{{ t('playback.rate') }}</span>
      <select :value="String(settings.ratePerSecond)" @change="onRate">
        <option v-for="rate in RATES" :key="rate" :value="String(rate)">
          {{ n(rate, 'integer') }}
        </option>
      </select>
    </label>

    <span v-else class="playback__position" aria-live="off">
      {{
        t('playback.position', { position: feed.replayPosition, total: feed.replayTotal })
      }}
    </span>
  </div>
</template>

<style scoped>
.playback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.playback__modes {
  display: inline-flex;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.playback__mode {
  position: relative;
  display: inline-flex;
}

.playback__mode input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.playback__mode span {
  padding: var(--space-1) var(--space-3);
  border-right: 1px solid var(--border);
  color: var(--text-muted);
}

.playback__mode:last-child span {
  border-right: 0;
}

.playback__mode input:checked + span {
  background: var(--accent);
  color: var(--accent-contrast);
}

.playback__mode input:focus-visible + span {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.playback__button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
}

.playback__button[aria-pressed='true'] {
  background: var(--surface-raised);
  font-weight: 600;
}

.playback__rate {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.playback__position {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
