import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('desktop application auth covers sign in, signup, recovery, and Google', async ({
  page,
}) => {
  await page.goto('/#/?demo=auth');
  await expect(
    page.getByRole('heading', { name: 'Sign in to TubeMilestones' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeEnabled();

  const signInPassword = page.getByLabel('Password', { exact: true });
  await expect(signInPassword).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(signInPassword).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(signInPassword).toHaveAttribute('type', 'password');

  await page.getByLabel('Email').fill('creator@example.com');
  await signInPassword.fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Show password' })).toHaveCount(2);
  await page.getByLabel('Email').fill('creator@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByLabel('Confirm password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill('unknown@example.com');
  await page.getByRole('button', { name: 'Send reset instructions' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  await expectNoHorizontalOverflow(page);

  await page.goto('/#/?demo=password-recovery');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose a new password' }),
  ).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('new password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('new password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('Password updated.');
  await expectNoHorizontalOverflow(page);

  await page.goto('/#/?demo=auth');
  await page.reload();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeEnabled();
});

test('desktop Home and Journey use the sidebar composition without overflow', async ({
  page,
}) => {
  await page.goto('/#/?demo=growing');

  await expect(page.getByRole('heading', { name: '25K' })).toBeVisible();
  await expect(page.locator('.desktop-sidebar')).toBeVisible();
  await expect(page.locator('.mobile-navigation-wrap')).toBeHidden();

  await page.getByLabel('Current channel: Fieldcraft Cinema. Switch channel').click();
  await expect(page.getByText(/youtube-owner@example\.com/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add YouTube account' })).toBeVisible();
  await page.getByLabel('Current channel: Fieldcraft Cinema. Switch channel').click();

  await page.getByLabel('TubeMilestones profile: Demo creator').click();
  const profileMenu = page.locator('.profile-menu__panel');
  await expect(profileMenu.getByText('Demo creator', { exact: true })).toBeVisible();
  await expect(
    profileMenu.getByRole('link', { name: 'Profile & settings' }),
  ).toBeVisible();
  await expect(
    profileMenu.getByRole('button', { name: 'Add YouTube account' }),
  ).toBeVisible();

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
