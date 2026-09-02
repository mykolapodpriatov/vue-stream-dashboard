import { expect, test } from '@playwright/test';
import { dataRows, gotoLive } from './helpers';

test.describe('instrument detail', () => {
  test('clicking a row opens that instrument, and the chart grows per frame', async ({
    page,
  }) => {
    await gotoLive(page);
    await dataRows(page).nth(2).click();
    await expect(page).toHaveURL(/\/instrument\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('FLW-00002');
    await expect(page.getByText('Flow', { exact: true })).toBeVisible();

    const chart = page.getByRole('img');
    await expect
      .poll(() => chart.getAttribute('aria-label'))
      .toMatch(/FLW-00002: \d+ points, from/);

    await page.getByRole('link', { name: 'Next instrument' }).click();
    await expect(page).toHaveURL(/\/instrument\/3$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('VIB-00003');
  });

  test('the grid is keyboard-operable: arrow to a row, Enter opens it', async ({
    page,
  }) => {
    await gotoLive(page);
    const grid = page.getByRole('grid', { name: 'Instruments' });
    await grid.focus();
    await page.keyboard.press('ArrowDown');
    await expect(grid).toHaveAttribute('aria-activedescendant', 'instrument-row-1');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/instrument\/1$/);
  });

  test('End jumps to the last of ten thousand rows and scrolls it into view', async ({
    page,
  }) => {
    await gotoLive(page);
    const grid = page.getByRole('grid', { name: 'Instruments' });
    await grid.focus();
    await page.keyboard.press('End');
    await expect(grid).toHaveAttribute('aria-activedescendant', 'instrument-row-9999');
    await expect(page.locator('#instrument-row-9999')).toBeVisible();
    expect(await dataRows(page).count()).toBeLessThanOrEqual(80);
  });

  test('an id outside the fleet is explained, not blank', async ({ page }) => {
    await gotoLive(page, '/instrument/123456');
    await expect(
      page.getByText(/There is no instrument 123456 in a fleet of/),
    ).toBeVisible();
  });
});
