import { defineConfig, devices } from '@playwright/test';

/**
 * The benchmark is a separate Playwright project on purpose: it measures
 * milliseconds, and milliseconds on a shared CI runner are noise. Nothing in
 * here fails a build. The results are written to `bench-results/` and uploaded
 * as an artifact so a regression can be *seen* across runs — which is a
 * different thing from being *gated on*.
 */
const PORT = 4319;

export default defineConfig({
  testDir: './bench',
  testMatch: /.*\.bench\.ts$/,
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm run build && pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
