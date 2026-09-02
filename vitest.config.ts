import { fileURLToPath, URL } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.spec.ts'],
      setupFiles: ['test/setup.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        // The worker entry is five lines of `self.onmessage` wiring around a
        // controller that is tested directly; a Worker cannot run under Vitest.
        exclude: [
          'src/main.ts',
          'src/sources/live.worker.ts',
          'src/**/*.spec.ts',
          'src/**/*.d.ts',
        ],
        reporter: ['text', 'lcov'],
        // Below the library's 90 and above a token gesture: this is an
        // application, and the last stretch is covered by Playwright rather
        // than by mocking the browser until the mock is the thing under test.
        thresholds: { statements: 85, branches: 78, functions: 82, lines: 85 },
      },
    },
  }),
);
