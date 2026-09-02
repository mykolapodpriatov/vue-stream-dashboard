import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * On GitHub Pages the app lives under `/vue-stream-dashboard/`; everywhere
 * else — dev, preview, the e2e suite — at the root. The router reads
 * `import.meta.env.BASE_URL`, so this is the only place the path is spelled.
 */
const base = process.env.GITHUB_PAGES ? '/vue-stream-dashboard/' : '/';

export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
