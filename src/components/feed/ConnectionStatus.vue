<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ConnectionStatus } from '@/stores/feed';

/**
 * `Connected · Reconnecting · Offline · Stale`, readable without the dot.
 *
 * Four states, four glyphs, four words. The colour is the least reliable of
 * the three channels and is treated as such.
 */
withDefaults(defineProps<{ status: ConnectionStatus; compact?: boolean }>(), {
  compact: false,
});

const { t } = useI18n();

const GLYPH: Record<ConnectionStatus, string> = {
  connected: '●',
  reconnecting: '◐',
  offline: '○',
  stale: '◇',
};
</script>

<template>
  <span
    class="conn"
    :class="[`conn--${status}`, { 'conn--compact': compact }]"
    :data-status="status"
  >
    <span class="conn__glyph" aria-hidden="true">{{ GLYPH[status] }}</span>
    <span class="conn__text">{{ t(`status.${status}`) }}</span>
  </span>
</template>

<style scoped>
.conn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border: 1px solid currentColor;
  border-radius: 999px;
  font-weight: 500;
  white-space: nowrap;
}

.conn--compact {
  padding: 0 var(--space-2);
  font-size: 0.85rem;
}

.conn--connected {
  color: var(--status-ok);
}

.conn--reconnecting {
  color: var(--status-warn);
}

.conn--offline {
  color: var(--status-idle);
}

.conn--stale {
  color: var(--status-bad);
}
</style>
