import { expect, test } from '@playwright/test';

test('desktop Journey uses the sidebar composition without overflow', async ({
  page,
}) => {
  await page.goto('/#/journey?demo=growing');

  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();
  await expect(page.locator('.desktop-sidebar')).toBeVisible();
  await expect(page.locator('.mobile-navigation-wrap')).toBeHidden();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
});
