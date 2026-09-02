import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import LiveFeedView from '@/views/LiveFeedView.vue';

/**
 * Only the landing route is in the entry chunk. Everything else is loaded on
 * navigation: a dashboard whose first paint waits for a chart library nobody
 * has asked to see yet is a dashboard that feels slow before it has done
 * anything.
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'live', component: LiveFeedView },
  {
    path: '/instrument/:id(\\d+)',
    name: 'instrument',
    component: () => import('@/views/InstrumentView.vue'),
    props: true,
  },
  {
    path: '/connection',
    name: 'connection',
    component: () => import('@/views/ConnectionView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
