import { expect, test } from '@playwright/test';
import { counters, dataRows, gotoLive, readStat, toNumber } from './helpers';

test.describe('live feed', () => {
  test('streams thousands of events a second through a handful of commits', async ({
    page,
  }) => {
    await gotoLive(page);

    await expect.poll(() => readStat(page, 'eventsPerSecond')).toBeGreaterThan(1_000);
    // One commit per animation frame, and a frame is at most 60 Hz. A little
    // headroom for the sliding-window arithmetic at the boundaries.
    const commitsPerSecond = await readStat(page, 'commitsPerSecond');
    expect(commitsPerSecond).toBeGreaterThan(0);
    expect(commitsPerSecond).toBeLessThanOrEqual(70);

    // Ten thousand instruments; a few dozen rows.
    await expect(page.locator('[data-stat="rendered"] dd')).toHaveText(
      /\/\s*10[,\s]000$/,
    );
    expect(await dataRows(page).count()).toBeLessThanOrEqual(80);
    await expect(page.getByRole('grid', { name: 'Instruments' })).toHaveAttribute(
      'aria-rowcount',
      '10001',
    );
  });

  test('sorting by value reorders the visible rows and says so', async ({ page }) => {
    await gotoLive(page);
    await page.getByRole('button', { name: 'Sort by Value' }).click();
    await expect(page.getByRole('columnheader').nth(2)).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    // Read the first two values in one evaluation so a commit cannot land
    // between the reads.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cells = document.querySelectorAll(
            '[role="row"][data-index] .table__cell--value .table__number',
          );
          const values = [...cells]
            .slice(0, 2)
            .map((el) => Number(el.textContent.replace(/[^\d.-]/g, '')));
          const [first, second] = values;
          return first !== undefined && second !== undefined && first <= second;
        }),
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Sort by Value' }).click();
    await expect(page.getByRole('columnheader').nth(2)).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  test('filtering by name narrows the fleet to the matching instruments', async ({
    page,
  }) => {
    await gotoLive(page);
    await page.getByRole('searchbox', { name: 'Filter by name' }).fill('TMP-0000');
    await expect(dataRows(page)).toHaveCount(2);
    await expect(dataRows(page).nth(0)).toContainText('TMP-00000');
    await expect(dataRows(page).nth(1)).toContainText('TMP-00005');

    await page
      .getByRole('searchbox', { name: 'Filter by name' })
      .fill('nothing-like-this');
    await expect(page.getByText('No instruments match the filter.')).toBeVisible();
  });

  test('the quality filter shows only rows of that quality', async ({ page }) => {
    await gotoLive(page);
    await page.getByRole('combobox', { name: 'Quality' }).selectOption('bad');
    await expect.poll(() => dataRows(page).count()).toBeGreaterThan(0);
    const qualities = await page
      .locator('[data-index] [data-quality]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-quality')));
    expect(qualities.length).toBeGreaterThan(0);
    expect(new Set(qualities)).toEqual(new Set(['bad']));
  });

  test('pause holds the table while events keep arriving; resume catches up', async ({
    page,
  }) => {
    await gotoLive(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const frozen = await counters(page);
    await page.waitForTimeout(500);
    expect(await counters(page)).toEqual(frozen);

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect
      .poll(async () => (await counters(page)).commits)
      .toBeGreaterThan(frozen.commits);
    // The backlog arrived in one batch rather than being lost.
    expect(
      toNumber(await page.locator('[data-stat="maxBatch"] dd').innerText()),
    ).toBeGreaterThan(200);
  });
});
