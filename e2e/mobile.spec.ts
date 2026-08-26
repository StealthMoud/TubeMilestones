import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('public landing explains the unconfigured cloud boundary', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Your YouTube journey, one milestone at a time.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeDisabled();
  await expect(page.getByText(/Cloud connection is not configured/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('privacy page keeps sensitive support out of public issues', async ({ page }) => {
  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { name: 'Privacy policy.' })).toBeVisible();
  await expect(
    page.getByText(/private privacy\/support address has not been configured/),
  ).toBeVisible();
  await expect(page.getByText(/Do not post tokens, email addresses/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('signed-in unconnected fixture shows the separate YouTube authorization step', async ({
  page,
}) => {
  await page.goto('/#/?demo=unconnected');
  await expect(
    page.getByRole('heading', { name: 'Connect your YouTube channel.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect YouTube' })).toBeEnabled();
  await expect(
    page.getByText(/cannot edit, upload, or delete YouTube content/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('connected Home is milestone-first', async ({ page }) => {
  await page.goto('/#/?demo=small');
  await expect(page.getByText('DEMO DATA')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1K' })).toBeVisible();
  await expect(page.getByText('258 subscribers to go')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent movement' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Journey uses one differentiated path and switches metrics', async ({ page }) => {
  await page.goto('/#/journey?demo=growing');
  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Views' }).click();
  await expect(page.getByText('1.82M now')).toBeVisible();
  await expect(page.getByText('Next checkpoint')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('28D Analytics prioritizes one value and simple detail rows', async ({ page }) => {
  await page.goto('/#/analytics?demo=small');
  await expect(page.getByRole('heading', { name: 'Views' })).toBeVisible();
  await expect(page.locator('.analytics-value > span')).toHaveText('28D total');
  await expect(page.locator('.analytics-details')).toContainText('Net subscribers');
  await page.getByRole('button', { name: 'Available' }).click();
  await expect(page.locator('.analytics-value > span')).toHaveText('Available history');
  await expectNoHorizontalOverflow(page);
});

test('365D Analytics loads unified mocked archive history', async ({ page }) => {
  await page.goto('/#/analytics?demo=archive');
  await page.getByRole('button', { name: '365D' }).click();
  await expect(page.locator('.analytics-value > span')).toHaveText('365D total');
  await expect(page.locator('.analytics-chart')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('archive failure keeps recent Analytics visible', async ({ page }) => {
  await page.goto('/#/analytics?demo=archive-partial');
  await page.getByRole('button', { name: '365D' }).click();
  await expect(
    page.getByText(/Older history is temporarily unavailable/),
  ).toBeVisible();
  await expect(page.locator('.analytics-value > span')).toHaveText('365D total');
  await expectNoHorizontalOverflow(page);
});

test('Settings is grouped and confirms disconnect semantics', async ({ page }) => {
  await page.goto('/#/settings?demo=small');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('User entered')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.getByRole('dialog', { name: 'Disconnect YouTube?' });
  await expect(dialog).toContainText('It does not delete anything from YouTube.');
  await dialog.getByRole('button', { name: 'Keep connected' }).click();
  await expect(dialog).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test('reauthorization and typed API errors stay contextual', async ({ page }) => {
  await page.goto('/#/?demo=reauth');
  await expect(
    page.getByText('Reconnect YouTube to refresh your progress.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reconnect', exact: true }),
  ).toBeVisible();
  await page.goto('/#/?demo=api-error');
  await page.reload();
  await expect(
    page.getByText('YouTube data is temporarily unavailable.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '1K' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('deletion-pending fixture makes unavailable data explicit', async ({ page }) => {
  await page.goto('/#/?demo=deletion-pending');
  await expect(
    page.getByRole('heading', { name: 'Your saved YouTube data is being removed.' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Supabase, Vault, and the encrypted archive/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
