import { expect, test } from '@playwright/test';
import { counters, dataRows, gotoLive, readStat } from './helpers';

/**
 * Structural performance invariants.
 *
 * Not "renders in under N ms" — a GitHub-hosted runner's milliseconds are
 * noise, and a gate on noise is a gate that gets disabled. These assert the
 * *shape* of the work, which is what the architecture actually promises:
 *
 *   dataset: 10 000 rows        → DOM rows rendered ≤ 80
 *   N events in a window        → commits ≤ animation frames in that window
 *   thousands of events/s       → events per commit ≫ 1
 *
 * They hold on a slow machine exactly as on a fast one, because they are
 * about counting, not timing. Absolute numbers live in the benchmark job.
 */
test.describe('structural invariants', () => {
  test('ten thousand rows never put more than 80 in the DOM', async ({ page }) => {
    await gotoLive(page);
    await page.getByRole('combobox', { name: 'Events per second' }).selectOption('20000');
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200);
      expect(await dataRows(page).count()).toBeLessThanOrEqual(80);
    }
    await expect(page.locator('[data-stat="rendered"] dd')).toContainText(/10[,\s]000/);
  });

  test('commits never outnumber animation frames', async ({ page }) => {
    await gotoLive(page);
    await page.getByRole('combobox', { name: 'Events per second' }).selectOption('20000');
    await page.waitForTimeout(300);

    const result = await page.evaluate(
      () =>
        new Promise<{ frames: number; commits: number; events: number }>((resolve) => {
          const bar = document.querySelector('dl.stats')!;
          const read = () => ({
            commits: Number(bar.getAttribute('data-commits')),
            events: Number(bar.getAttribute('data-events')),
          });
          const start = read();
          let frames = 0;
          const deadline = performance.now() + 1_500;
          const tick = () => {
            frames += 1;
            if (performance.now() < deadline) {
              requestAnimationFrame(tick);
              return;
            }
            const end = read();
            resolve({
              frames,
              commits: end.commits - start.commits,
              events: end.events - start.events,
            });
          };
          requestAnimationFrame(tick);
        }),
    );

    expect(result.frames).toBeGreaterThan(10);
    // One commit per frame at most (a frame in flight at each boundary is the
    // only slack).
    expect(result.commits).toBeLessThanOrEqual(result.frames + 1);
    // And the batching is doing real work: hundreds of events per commit at
    // 20k/s, and certainly more than a handful.
    expect(result.events / Math.max(1, result.commits)).toBeGreaterThan(20);
  });

  test('a burst is absorbed by the buffer, not by the DOM', async ({ page }) => {
    await gotoLive(page);
    // Pause to build a backlog, then resume. The backlog must land as one
    // large batch — the buffer absorbing it — while the DOM stays the same
    // size. Asserted through the largest-batch counter rather than a commit
    // delta between two reads: the feed keeps committing every frame after
    // the resume, and a slow runner widens the gap between reads.
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(1_000);
    const before = await counters(page);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => readStat(page, 'maxBatch')).toBeGreaterThan(2_000);
    const after = await counters(page);
    expect(after.events - before.events).toBeGreaterThan(2_000);
    expect(await dataRows(page).count()).toBeLessThanOrEqual(80);
  });
});
