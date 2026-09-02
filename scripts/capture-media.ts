/**
 * Capture the README media from the built app: screenshots of each screen in
 * both themes, and a short video of the live feed that `ffmpeg` turns into a
 * GIF.
 *
 * Run `pnpm run build` first, then `pnpm run media`. The script starts its
 * own preview server on a port nothing else uses and stops it afterwards.
 * Requires `ffmpeg` on the PATH for the GIF step; the screenshots do not.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const PORT = 4320;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'docs/media';
const VIEWPORT = { width: 1280, height: 720 };

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`preview server did not answer at ${url}`);
}

async function settle(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Themes are emulated through `prefers-color-scheme` rather than the in-app
 * radio: settings live in memory, and every `page.goto` is a fresh load.
 */
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

async function screenshots(page: Page): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await page.goto(`${BASE}/`);
    await page.getByRole('combobox', { name: 'Events per second' }).selectOption('20000');
    await settle(page, 4_000);
    await page.screenshot({ path: `${OUT}/live-feed-${theme}.png` });

    // In-app navigation keeps the rate and the readings; a fresh load would not.
    await page.locator('[data-index="7"]').click();
    await settle(page, 4_000);
    await page.screenshot({ path: `${OUT}/instrument-${theme}.png` });

    await page.getByRole('link', { name: 'Connection' }).click();
    await settle(page, 800);
    await page.screenshot({ path: `${OUT}/connection-${theme}.png` });
  }
}

async function video(browserPath: string): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: `${OUT}/.video`, size: VIEWPORT },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await settle(page, 1_500);
  // Show the rate going up, a sort by value, and a filter — the story of the
  // README in eight seconds.
  await page.getByRole('combobox', { name: 'Events per second' }).selectOption('20000');
  await settle(page, 2_500);
  await page.getByRole('button', { name: 'Sort by Value' }).click();
  await settle(page, 2_000);
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('VIB');
  await settle(page, 2_000);
  await context.close();
  await browser.close();

  const files = await readdir(`${OUT}/.video`);
  const webm = files.find((name) => name.endsWith('.webm'));
  if (!webm) throw new Error('no video recorded');
  await rename(`${OUT}/.video/${webm}`, `${OUT}/live-feed.webm`);
  await rm(`${OUT}/.video`, { recursive: true, force: true });

  // Two-pass palette for a GIF that is small and not dithered to mush.
  const gif = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      `${OUT}/live-feed.webm`,
      '-vf',
      'fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
      `${OUT}/live-feed.gif`,
    ],
    { stdio: 'inherit' },
  );
  if (gif.status !== 0)
    throw new Error(`ffmpeg exited with ${gif.status} (${browserPath})`);
  await rm(`${OUT}/live-feed.webm`, { force: true });
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const server = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'preview',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  try {
    await waitFor(BASE, 30_000);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await screenshots(page);
    await browser.close();
    await video(chromium.executablePath());
  } finally {
    server.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
