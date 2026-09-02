import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the **built** bundle served by `vite preview`,
 * not the dev server.
 *
 * Dev-only behaviour is different behaviour: the dev server does not minify,
 * does not split chunks the same way and — the one that matters here — loads
 * the Web Worker through a different code path. A suite that passes there and
 * fails in production is worse than no suite, because it is trusted.
 */
export const PORT = 4318;

export default defineConfig({
  testDir: './e2e',
  // A flaky end-to-end suite gets ignored, and an ignored suite is dead weight.
  // Failing on `.only` keeps a debugging shortcut from silently disabling the
  // rest of it in CI.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    // Not a port anything else on a developer's machine is likely to hold.
    // Playwright will happily test whatever answers, and the first run of a
    // sibling project's suite passed its assertions against an unrelated app.
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `pnpm run build && pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse: an existing listener on this port is not necessarily this
    // application.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
