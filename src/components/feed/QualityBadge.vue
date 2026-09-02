<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Quality } from '@/domain/telemetry';

/**
 * Quality as text, shape and colour — in that order of importance. The glyph
 * differs per state so the three are distinguishable without colour, and the
 * text is always present so nothing has to be inferred from a symbol.
 */
defineProps<{ quality: Quality }>();

const { t } = useI18n();

const GLYPH: Record<Quality, string> = { good: '●', suspect: '▲', bad: '■' };
</script>

<template>
  <span class="quality" :class="`quality--${quality}`" :data-quality="quality">
    <span class="quality__glyph" aria-hidden="true">{{ GLYPH[quality] }}</span>
    {{ t(`quality.${quality}`) }}
  </span>
</template>

<style scoped>
.quality {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  white-space: nowrap;
}

.quality__glyph {
  font-size: 0.7em;
}

.quality--good {
  color: var(--status-ok);
}

.quality--suspect {
  color: var(--status-warn);
}

.quality--bad {
  color: var(--status-bad);
}
</style>
