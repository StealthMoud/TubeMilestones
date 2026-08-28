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

  await page.getByLabel('Current channel: Syntax Sphere. Switch channel').click();
  await expect(page.getByText(/youtube-owner@example\.com/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add YouTube account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.channel-switcher__panel')).toBeHidden();
  await expect(
    page.getByLabel('Current channel: Syntax Sphere. Switch channel'),
  ).toBeFocused();

  await page.getByLabel('TubeMilestones profile: Demo creator').click();
  const profileMenu = page.locator('.profile-menu__panel');
  await expect(profileMenu.getByText('Demo creator', { exact: true })).toBeVisible();
  await expect(
    profileMenu.getByRole('link', { name: 'Profile & settings' }),
  ).toBeVisible();
  await expect(
    profileMenu.getByRole('button', { name: 'Add YouTube account' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(profileMenu).toBeHidden();
  await expect(page.getByLabel('TubeMilestones profile: Demo creator')).toBeFocused();

  await page.getByRole('link', { name: 'Journey', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test('Journey keeps one next checkpoint, shows history, and exports a PNG', async ({
  page,
}) => {
  await page.goto('/#/journey?demo=small');

  await expect(page.getByRole('heading', { name: 'Next milestone' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Milestones achieved' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '500 subscribers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100 subscribers' })).toBeVisible();
  await expect(page.getByText('2.5K', { exact: true })).toHaveCount(0);

  const exportButtons = page.getByRole('button', {
    name: /Export .* milestone as an image/,
  });
  await expect(exportButtons).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await exportButtons.first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^tubemilestones-.+\.png$/u);
  expect(await download.path()).not.toBeNull();
  await expectNoHorizontalOverflow(page);
});

test('Journey hierarchy, column balance, and empty checkpoints stay compact', async ({
  page,
}) => {
  await page.goto('/#/journey?demo=growing');
  await expect(
    page.getByRole('heading', { name: 'Your milestone journey.' }),
  ).toBeVisible();

  const composition = await page.evaluate(() => {
    const title = document.querySelector('.journey-heading h1');
    const primary = document.querySelector('.journey-primary');
    const secondary = document.querySelector('.journey-secondary');
    if (!title || !primary || !secondary) return null;
    const primaryWidth = primary.getBoundingClientRect().width;
    const secondaryWidth = secondary.getBoundingClientRect().width;
    return {
      titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
      primaryShare: primaryWidth / (primaryWidth + secondaryWidth),
    };
  });
  expect(composition).not.toBeNull();
  expect(composition!.titleSize).toBeGreaterThanOrEqual(30);
  expect(composition!.titleSize).toBeLessThanOrEqual(34);
  expect(composition!.primaryShare).toBeGreaterThanOrEqual(0.66);
  expect(composition!.primaryShare).toBeLessThanOrEqual(0.72);

  await page.goto('/#/journey?demo=persian');
  await page.reload();
  const empty = page.locator('.custom-goals-empty');
  await expect(empty).toContainText('No custom checkpoints');
  await expect(empty).toContainText('Create one for a personal target.');
  expect(
    await empty.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(72);
  await expect(
    page.getByRole('heading', { name: 'YouTube Partner Program progress' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Home uses one segment progress model and sparse history stays honest', async ({
  page,
}) => {
  await page.goto('/#/?demo=small');

  const progress = page.getByRole('progressbar', { name: '1K' });
  await expect(progress).toHaveAttribute('aria-valuemin', '500');
  await expect(progress).toHaveAttribute('aria-valuemax', '1000');
  await expect(progress).toHaveAttribute('aria-valuenow', '586');
  await expect(page.getByText('17%')).toBeVisible();
  await expect(page.getByText(/Current segment 500 → 1K/u)).toBeVisible();
  await expect(page.getByText('59%')).toHaveCount(0);
  await expect(page.getByText(/Subscribers progress/u)).toHaveCount(0);

  await page.goto('/#/?demo=persian');
  await page.reload();
  await expect(page.locator('.movement-sparse')).toBeVisible();
  await expect(page.locator('.movement-chart')).toHaveCount(0);
  await expect(page.getByText('3 reported days since Aug 22')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('pointer navigation stays quiet while keyboard focus remains visible', async ({
  page,
}) => {
  await page.goto('/#/?demo=small');
  const journey = page
    .locator('.desktop-sidebar')
    .getByRole('link', { name: 'Journey', exact: true });
  await journey.click();

  const pointerFocus = await journey.evaluate((link) => {
    const style = getComputedStyle(link);
    return {
      focusVisible: link.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(pointerFocus.focusVisible).toBe(false);
  expect(
    pointerFocus.outlineStyle === 'none' || pointerFocus.outlineWidth === '0px',
  ).toBe(true);

  await page.keyboard.press('Tab');
  const keyboardFocus = page.locator(
    '.desktop-sidebar .main-navigation__link:focus-visible',
  );
  await expect(keyboardFocus).toHaveCount(1);
  expect(
    await keyboardFocus.evaluate((link) =>
      Number.parseFloat(getComputedStyle(link).outlineWidth),
    ),
  ).toBeGreaterThanOrEqual(2);
});

test('authenticated shell controls remain consistent across every app screen', async ({
  page,
}) => {
  for (const route of ['/', '/journey', '/analytics', '/settings']) {
    await page.goto(`/#${route}?demo=small`);
    await expect(
      page.getByLabel('Current channel: HackFrame. Switch channel'),
    ).toBeVisible();
    await expect(page.locator('.app-header__freshness')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Refresh YouTube data' }),
    ).toBeVisible();
    await expect(page.getByLabel('TubeMilestones profile: Demo creator')).toBeVisible();
  }
});

test('a newer stored snapshot appears once as a dismissible channel update', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = 'tubemilestones:last-seen-snapshot:v1:demo-small';
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, '2026-07-12T09:30:00.000Z');
    }
  });
  await page.goto('/#/?demo=small');

  const update = page.getByRole('status', { name: 'New channel update' });
  await expect(update).toBeVisible();
  await expect(update).toContainText('586 subscribers');
  await expect(update).toContainText('+83');
  await expect(update).toContainText('48,200 views');
  await expect(update).toContainText('+14,251');
  await expect(update).toContainText('23 uploads');
  await expect(update).toContainText('+2');
  await expect(update).toContainText('Since the previous snapshot');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Dismiss channel update' }).click();
  await expect(update).toBeHidden();
  await page.reload();
  await expect(update).toBeHidden();
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
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
    { width: 1600, height: 1000 },
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

test('primary screens render without browser console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  for (const route of ['/', '/journey', '/analytics', '/settings']) {
    await page.goto(`/#${route}?demo=small&screen=${route.slice(1) || 'home'}`);
    await expect(page.locator('main')).toBeVisible();
  }

  expect(errors).toEqual([]);
});
