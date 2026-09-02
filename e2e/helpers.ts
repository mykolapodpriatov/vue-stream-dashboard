import { expect, type Locator, type Page } from '@playwright/test';

/** Parse a locale-formatted integer such as `5,095` or `5 095`. */
export function toNumber(text: string): number {
  const digits = text.replace(/[^\d.-]/g, '');
  return digits === '' ? Number.NaN : Number(digits);
}

export function stat(page: Page, key: string): Locator {
  return page.locator(`[data-stat="${key}"] dd`);
}

export async function readStat(page: Page, key: string): Promise<number> {
  return toNumber(await stat(page, key).innerText());
}

/** Raw counters the stats bar exposes for structural assertions. */
export async function counters(page: Page): Promise<{ events: number; commits: number }> {
  const bar = page.locator('dl.stats');
  return {
    events: Number(await bar.getAttribute('data-events')),
    commits: Number(await bar.getAttribute('data-commits')),
  };
}

/**
 * Open a page and wait until the feed has connected — and, on the live feed
 * page, until it has committed at least once. The stats bar only exists there.
 */
export async function gotoLive(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.app-status [data-status]')).toHaveAttribute(
    'data-status',
    'connected',
  );
  if ((await page.locator('dl.stats').count()) > 0) {
    await expect.poll(async () => (await counters(page)).commits).toBeGreaterThan(0);
  }
}

export async function setPlayback(
  page: Page,
  mode: 'Live' | '1×' | '10×' | '100×' | 'Step',
) {
  await page.getByRole('radio', { name: mode, exact: true }).check();
}

export const dataRows = (page: Page) => page.locator('[role="row"][data-index]');
