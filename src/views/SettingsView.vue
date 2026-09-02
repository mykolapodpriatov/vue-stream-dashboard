<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { LOCALES } from '@/i18n';
import { useFeedStore } from '@/stores/feed';
import { FLEET_SIZES, RATES, THEMES, useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const feed = useFeedStore();
const { t, n } = useI18n();

function onSeed(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) settings.seed = Math.floor(value);
}
</script>

<template>
  <section class="settings">
    <h1>{{ t('settings.title') }}</h1>

    <section class="settings__panel">
      <h2>{{ t('settings.appearance') }}</h2>
      <fieldset>
        <legend>{{ t('settings.theme.legend') }}</legend>
        <label v-for="theme in THEMES" :key="theme">
          <input v-model="settings.theme" type="radio" name="theme" :value="theme" />
          {{ t(`settings.theme.${theme}`) }}
        </label>
      </fieldset>
      <fieldset>
        <legend>{{ t('settings.language.legend') }}</legend>
        <label v-for="locale in LOCALES" :key="locale">
          <input v-model="settings.locale" type="radio" name="locale" :value="locale" />
          {{ t(`settings.language.${locale}`) }}
        </label>
      </fieldset>
    </section>

    <section class="settings__panel">
      <h2>{{ t('settings.fleet') }}</h2>
      <p class="settings__help">{{ t('settings.instrumentsHelp') }}</p>
      <div class="settings__grid">
        <label>
          <span>{{ t('settings.instruments') }}</span>
          <select v-model.number="settings.instruments">
            <option v-for="size in FLEET_SIZES" :key="size" :value="size">
              {{ n(size, 'integer') }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ t('settings.rate') }}</span>
          <select v-model.number="settings.ratePerSecond">
            <option v-for="rate in RATES" :key="rate" :value="rate">
              {{ n(rate, 'integer') }}
            </option>
          </select>
        </label>
        <div class="settings__field">
          <label for="fleet-seed">{{ t('settings.seed') }}</label>
          <input
            id="fleet-seed"
            type="number"
            :value="settings.seed"
            min="0"
            step="1"
            aria-describedby="fleet-seed-help"
            @change="onSeed"
          />
          <span id="fleet-seed-help" class="settings__help">{{
            t('settings.seedHelp')
          }}</span>
        </div>
        <div class="settings__field settings__check">
          <input
            id="fleet-dirty"
            v-model="settings.dirtyWire"
            type="checkbox"
            aria-describedby="fleet-dirty-help"
          />
          <label for="fleet-dirty">{{ t('settings.dirtyWire') }}</label>
          <span id="fleet-dirty-help" class="settings__help">
            {{ t('settings.dirtyWireHelp') }}
          </span>
        </div>
      </div>
      <button type="button" class="settings__apply" @click="feed.applyFleet()">
        {{ t('settings.apply') }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 40rem;
}

.settings__panel {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.settings__panel h2 {
  font-size: 1.1rem;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

legend {
  padding: 0 var(--space-1);
  color: var(--text-muted);
  font-size: 0.85rem;
}

.settings__grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.settings__grid label,
.settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings__check {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.settings__check .settings__help {
  width: 100%;
}

.settings__grid input,
.settings__grid select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}

.settings__help {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.settings__apply {
  margin-top: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  cursor: pointer;
}
</style>
