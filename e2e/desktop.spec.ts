import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('desktop Home and Journey use the sidebar composition without overflow', async ({
  page,
}) => {
  await page.goto('/#/?demo=growing');

  await expect(page.getByRole('heading', { name: '25K' })).toBeVisible();
  await expect(page.locator('.desktop-sidebar')).toBeVisible();
  await expect(page.locator('.mobile-navigation-wrap')).toBeHidden();

  await page.getByRole('link', { name: 'Journey', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test('responsive matrix is overflow-free in dark and light themes', async ({
  page,
}) => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/?demo=small');
    await expect(page.getByRole('heading', { name: '1K' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/settings?demo=small');
  await page.reload();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Views' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
