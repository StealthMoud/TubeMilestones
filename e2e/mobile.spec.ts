import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('public landing renders without OAuth and fits the viewport', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Your YouTube journey, one milestone at a time.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect YouTube' })).toBeDisabled();
  await expect(
    page.getByText('Google OAuth is not configured for this deployment.'),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('bottom navigation works and Journey switches metrics', async ({ page }) => {
  await page.goto('/#/?demo=small');
  await expect(page.getByText('DEMO DATA')).toBeVisible();

  await page.getByRole('link', { name: 'Journey', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Views' }).click();
  await expect(page.getByText('48.2K now')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Analytics range selector updates fixture summaries', async ({ page }) => {
  await page.goto('/#/analytics?demo=small');
  await expect(
    page.getByRole('heading', { name: 'Recent channel movement.' }),
  ).toBeVisible();

  const sevenDays = page.getByRole('button', { name: '7D' });
  await sevenDays.click();
  await expect(sevenDays).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/^Last 7 days:/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Settings requires confirmation before disconnecting', async ({ page }) => {
  await page.goto('/#/settings?demo=small');
  await expect(page.getByRole('heading', { name: 'Settings.' })).toBeVisible();

  await page.getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.getByRole('dialog', { name: 'Disconnect YouTube?' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Disconnect and delete' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep connected' }).click();
  await expect(dialog).toBeHidden();
  await expectNoHorizontalOverflow(page);
});
