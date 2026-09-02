<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView } from 'vue-router';
import ConnectionStatus from '@/components/feed/ConnectionStatus.vue';
import { useAppearance } from '@/composables/useAppearance';
import { useAnnouncerStore } from '@/stores/announcer';
import { useFeedStore } from '@/stores/feed';

const { t } = useI18n();
const feed = useFeedStore();
const announcer = useAnnouncerStore();
useAppearance();

const nav = [
  { to: '/', key: 'live' },
  { to: '/connection', key: 'connection' },
  { to: '/settings', key: 'settings' },
] as const;

// The feed belongs to the shell, not to a page: navigating away from the
// table must not stop the data, or the instrument page would open onto a
// frozen fleet.
onMounted(() => {
  if (!feed.started) feed.start();
});

watch(
  () => feed.status,
  (status) =>
    void announcer.announce(t('status.announce', { status: t(`status.${status}`) })),
);
</script>

<template>
  <a class="skip-link" href="#main">{{ t('app.skip') }}</a>
  <header class="app-header">
    <p class="app-title">{{ t('app.title') }}</p>
    <nav :aria-label="t('app.navLabel')">
      <ul class="app-nav">
        <li v-for="item in nav" :key="item.to">
          <RouterLink :to="item.to">{{ t(`app.nav.${item.key}`) }}</RouterLink>
        </li>
      </ul>
    </nav>
    <RouterLink to="/connection" class="app-status">
      <ConnectionStatus :status="feed.status" compact />
    </RouterLink>
  </header>
  <main id="main" class="app-main" tabindex="-1">
    <RouterView />
  </main>
  <div class="visually-hidden" role="status" aria-live="polite">
    {{ announcer.message }}
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.app-title {
  margin: 0;
  font-weight: 600;
}

.app-nav {
  display: flex;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-nav a {
  color: var(--text-muted);
  text-decoration: none;
  padding: var(--space-1) 0;
}

/* Current page: `aria-current` is what vue-router sets, and it is also the
   selector — so the state can never be styled without being announced. */
.app-nav a[aria-current='page'] {
  color: var(--text);
  border-bottom: 2px solid var(--accent);
}

.app-status {
  margin-left: auto;
  text-decoration: none;
}

.app-main {
  padding: var(--space-4);
}

.app-main:focus {
  outline: none;
}
</style>
