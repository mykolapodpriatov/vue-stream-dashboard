<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';

const nav = [
  { to: '/', label: 'Live feed' },
  { to: '/connection', label: 'Connection' },
  { to: '/settings', label: 'Settings' },
] as const;
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="app-header">
    <p class="app-title">Stream Dashboard</p>
    <nav aria-label="Primary">
      <ul class="app-nav">
        <li v-for="item in nav" :key="item.to">
          <RouterLink :to="item.to">{{ item.label }}</RouterLink>
        </li>
      </ul>
    </nav>
  </header>
  <main id="main" class="app-main" tabindex="-1">
    <RouterView />
  </main>
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

.app-main {
  padding: var(--space-4);
}

.app-main:focus {
  outline: none;
}
</style>
