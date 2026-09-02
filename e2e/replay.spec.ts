import { expect, test } from '@playwright/test';
import { counters, gotoLive, setPlayback } from './helpers';

test.describe('replay', () => {
  test('step mode delivers exactly one batch per click', async ({ page }) => {
    await gotoLive(page);
    await setPlayback(page, 'Step');

    const position = page.locator('.playback__position');
    await expect(position).toHaveText(/^0 of \d+ batches$/);
    await expect(page.locator('.app-status [data-status]')).toHaveAttribute(
      'data-status',
      'connected',
    );

    const before = await counters(page);
    const next = page.getByRole('button', { name: 'Next batch' });
    for (let i = 0; i < 3; i++) await next.click();
    await expect(position).toHaveText(/^3 of \d+ batches$/);

    // Three ticks of a 5 000/s recording, batched by 20 ms windows: ~100 each.
    // Poll for the last one to land — on a slow runner the batches are still
    // in flight when the position readout has already moved.
    await expect
      .poll(async () => (await counters(page)).events - before.events)
      .toBeGreaterThanOrEqual(280);
    const after = await counters(page);
    expect(after.events - before.events).toBeLessThanOrEqual(320);
    // Never more commits than steps.
    expect(after.commits - before.commits).toBeGreaterThanOrEqual(1);
    expect(after.commits - before.commits).toBeLessThanOrEqual(3);

    // And the table went quiet between steps: nothing pending, nothing moving.
    await page.waitForTimeout(300);
    expect(await counters(page)).toEqual(after);
  });

  test('100× plays through the recording on its own and loops', async ({ page }) => {
    await gotoLive(page);
    await setPlayback(page, '100×');
    const position = page.locator('.playback__position');
    await expect
      .poll(async () => Number((await position.innerText()).split(' ')[0]))
      .toBeGreaterThan(20);
    // Switching back to live restarts the worker and the position control gives
    // way to the rate control.
    await setPlayback(page, 'Live');
    await expect(page.getByRole('combobox', { name: 'Events per second' })).toBeVisible();
  });
});
