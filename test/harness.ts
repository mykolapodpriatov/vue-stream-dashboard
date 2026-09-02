import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createApp, type App } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createAppI18n, type AppI18n } from '@/i18n';
import { createManualScheduler, type ManualScheduler } from '@/pipeline/frameScheduler';
import { routes } from '@/router';
import { FEED_DEPS, type FeedDeps } from '@/stores/deps';
import { createFakeWorker, type FakeWorker } from './fakeWorker';

/**
 * Everything a component or store test needs to run the real app wiring with
 * the seams swapped: a hand-driven frame scheduler, fake workers the test can
 * feed, and a clock that follows the scheduler.
 */
export interface Harness {
  pinia: Pinia;
  i18n: AppI18n;
  router: Router;
  scheduler: ManualScheduler;
  /** Every worker created so far, oldest first. */
  workers: FakeWorker[];
  deps: FeedDeps;
  /** Pass as `global` to `mount()`. */
  global: {
    plugins: [Pinia, Router, AppI18n];
    provide: Record<symbol, unknown>;
  };
  /** For store tests without a component: an app with the same plugins. */
  app: App;
}

export function createHarness(): Harness {
  const scheduler = createManualScheduler();
  const workers: FakeWorker[] = [];
  const deps: FeedDeps = {
    createWorker: () => {
      const worker = createFakeWorker();
      workers.push(worker);
      return worker;
    },
    scheduler,
    now: () => scheduler.now,
  };

  const pinia = createPinia();
  const i18n = createAppI18n();
  const router = createRouter({ history: createMemoryHistory(), routes });

  const app = createApp({ render: () => null });
  app.use(pinia).use(router).use(i18n);
  app.provide(FEED_DEPS, deps);
  setActivePinia(pinia);

  return {
    pinia,
    i18n,
    router,
    scheduler,
    workers,
    deps,
    app,
    global: {
      plugins: [pinia, router, i18n],
      provide: { [FEED_DEPS as symbol]: deps },
    },
  };
}

/** Resolve the microtask queue a few times — enough for an async iteration step. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
