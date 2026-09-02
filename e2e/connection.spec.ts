import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { gotoLive } from './helpers';

const status = (page: Page) => page.locator('.app-status [data-status]');
const ago = (page: Page) => page.getByText(/^\d+ s ago$/);

async function secondsAgo(page: Page): Promise<number> {
  return Number((await ago(page).innerText()).split(' ')[0]);
}

test.describe('connection', () => {
  test('a drop takes the feed offline; reconnect brings it back', async ({ page }) => {
    await gotoLive(page, '/connection');
    await page.getByRole('button', { name: 'Drop' }).click();
    await expect(status(page)).toHaveAttribute('data-status', 'offline');
    await expect(status(page)).toHaveText(/Offline/);
    await expect(page.getByRole('status')).toHaveText('Connection Offline');

    await page.getByRole('button', { name: 'Reconnect' }).click();
    await expect(status(page)).toHaveAttribute('data-status', 'connected');
  });

  test('a stall looks connected — the zombie the next PR will unmask', async ({
    page,
  }) => {
    // Documented as the current, incomplete behaviour: without a stall watchdog
    // the UI has no way to know the data stopped. The composables kit brings
    // that watchdog; this test will then assert "Stale" instead.
    await gotoLive(page, '/connection');
    await page.getByRole('button', { name: 'Stall' }).click();
    await expect(page.getByRole('button', { name: 'Stall' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(ago(page)).toBeVisible();
    await expect
      .poll(() => secondsAgo(page), { timeout: 6_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(status(page)).toHaveAttribute('data-status', 'connected');

    await page.getByRole('button', { name: 'Clear fault' }).click();
    await expect.poll(() => secondsAgo(page)).toBeLessThanOrEqual(1);
  });

  test('a recording can be captured, downloaded and is a valid file', async ({
    page,
  }) => {
    await gotoLive(page, '/connection');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByText(/^\d[\d,\s]* frames recorded$/)).toBeVisible();
    await page.waitForTimeout(400);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Stop and download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^recording-.*\.json$/);

    const path = await download.path();
    const recording = JSON.parse(await readFile(path, 'utf8')) as {
      version: number;
      meta: { instruments: number; recordedAt?: string };
      frames: unknown[][];
    };
    expect(recording.version).toBe(1);
    expect(recording.meta.instruments).toBe(10_000);
    expect(recording.frames.length).toBeGreaterThan(100);
    expect(recording.frames[0]).toHaveLength(5);
  });

  test('loading a recording switches to replay and adopts its fleet', async ({
    page,
  }) => {
    await gotoLive(page, '/connection');
    const recording = {
      version: 1,
      meta: { instruments: 5 },
      frames: [
        [0, 1_700_000_000_000, 0, 61.5, 0],
        [1, 1_700_000_000_010, 1, 402, 1],
        [2, 1_700_000_000_400, 2, 24.1, 0],
      ],
    };
    await page.getByLabel('Load a recording').setInputFiles({
      name: 'session.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(recording)),
    });
    // Shown on the page and announced through the live region — assert both.
    await expect(
      page.locator('p', { hasText: 'Loaded 3 frames from session.json' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      'Loaded 3 frames from session.json',
    );
    // The transport readout, not the "Recording" section heading.
    await expect(page.locator('dd', { hasText: /^Recording$/ })).toBeVisible();

    await page.getByRole('link', { name: 'Live feed' }).click();
    await expect(page.getByRole('radio', { name: '1×', exact: true })).toBeChecked();
    await expect(page.locator('[data-stat="rendered"] dd')).toHaveText(/\/ 5$/);
  });

  test('a file that is not a recording is rejected in place', async ({ page }) => {
    await gotoLive(page, '/connection');
    await page.getByLabel('Load a recording').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":1,"frames":"nope"}'),
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('That file is not a recording');
    await expect(alert).toContainText('meta');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connection');
  });
});
