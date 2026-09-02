import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';

/**
 * Push the appearance settings onto `<html>`, where CSS and the browser read
 * them: `data-theme` for the tokens, `lang` for hyphenation, quotes and
 * screen-reader voice.
 *
 * `system` removes the attribute rather than setting a third value, so the
 * `prefers-color-scheme` rules in `tokens.css` take over unchanged.
 */
export function useAppearance(): void {
  const settings = useSettingsStore();
  const { locale } = useI18n({ useScope: 'global' });

  watchEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  });

  watchEffect(() => {
    locale.value = settings.locale;
    document.documentElement.lang = settings.locale;
  });
}
