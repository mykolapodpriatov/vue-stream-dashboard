import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoLive } from './helpers';

/**
 * Automated accessibility checks on every screen.
 *
 * Automated tooling catches perhaps a third of real accessibility problems —
 * the mechanical ones: missing labels, insufficient contrast, unnamed
 * landmarks, broken heading order. It cannot tell whether the focus order
 * makes sense or whether the grid is usable with a screen reader. So this is a
 * floor, not a certificate; the judgement-dependent parts are asserted
 * individually below.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

test.describe('accessibility', () => {
  for (const path of [
    '/',
    '/instrument/3',
    '/connection',
    '/settings',
    '/nothing-here',
  ]) {
    test(`${path} has no automatically detectable violations`, async ({ page }) => {
      await gotoLive(page, path);
      const { violations } = await scan(page);
      expect(violations).toEqual([]);
    });
  }

  test('the dark theme passes too', async ({ page }) => {
    // Contrast has to hold in both themes; checking only the default is how
    // dark-mode text ends up grey on grey.
    await gotoLive(page, '/settings');
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await scan(page)).violations).toEqual([]);
    await page.getByRole('link', { name: 'Live feed' }).click();
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the skip link is the first thing a keyboard reaches, and it works', async ({
    page,
  }) => {
    await gotoLive(page);
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveText('Skip to content');
    await expect(focused).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('every page has exactly one level-1 heading', async ({ page }) => {
    for (const path of ['/', '/instrument/3', '/connection', '/settings']) {
      await gotoLive(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    }
  });

  test('the current page is marked, not merely coloured', async ({ page }) => {
    await gotoLive(page, '/connection');
    const current = page
      .getByRole('navigation', { name: 'Primary' })
      .locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Connection');
  });

  test('connection state is conveyed as text, and announced', async ({ page }) => {
    await gotoLive(page, '/connection');
    await expect(page.locator('.app-status')).toContainText('Connected');
    await page.getByRole('button', { name: 'Drop' }).click();
    await expect(page.getByRole('status')).toHaveText('Connection Offline');
  });

  test('the virtual grid describes its full size, not just the rendered rows', async ({
    page,
  }) => {
    await gotoLive(page);
    const grid = page.getByRole('grid', { name: 'Instruments' });
    await expect(grid).toHaveAttribute('aria-rowcount', '10001');
    await expect(grid).toHaveAttribute('aria-activedescendant', 'instrument-row-0');
    // Rows that are in the DOM say where they are in the whole.
    await expect(page.locator('[data-index="1"]')).toHaveAttribute('aria-rowindex', '3');
  });

  test('switching to Russian changes the document language', async ({ page }) => {
    await gotoLive(page, '/settings');
    await page.getByRole('radio', { name: 'Русский' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Настройки');
    expect((await scan(page)).violations).toEqual([]);
  });
});
