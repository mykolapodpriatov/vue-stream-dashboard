import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Locale } from '@/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEMES = ['system', 'light', 'dark'] as const;

export const FLEET_SIZES = [1_000, 10_000, 50_000] as const;
export const RATES = [100, 1_000, 5_000, 10_000, 20_000] as const;

export const DEFAULT_SETTINGS = {
  theme: 'system' as ThemePreference,
  locale: 'en' as Locale,
  instruments: 10_000,
  ratePerSecond: 5_000,
  seed: 2026,
  dirtyWire: false,
};

/**
 * User preferences. Plain refs, deliberately not persisted yet: persistence
 * that survives a hostile browser is what the composables kit is for, and it
 * arrives with the kit.
 */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemePreference>(DEFAULT_SETTINGS.theme);
  const locale = ref<Locale>(DEFAULT_SETTINGS.locale);
  const instruments = ref<number>(DEFAULT_SETTINGS.instruments);
  const ratePerSecond = ref<number>(DEFAULT_SETTINGS.ratePerSecond);
  const seed = ref<number>(DEFAULT_SETTINGS.seed);
  const dirtyWire = ref<boolean>(DEFAULT_SETTINGS.dirtyWire);

  return { theme, locale, instruments, ratePerSecond, seed, dirtyWire };
});
