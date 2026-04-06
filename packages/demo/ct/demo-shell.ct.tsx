import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../src/DemoApp';

/**
 * @description Validates the phase 2 demo shell scenario from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md`.
 */
test('fills the viewport and renders the sample document on screen', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const shell = page.getByTestId('demo-shell');
  const rendererHost = page.getByTestId('screen-renderer-host');

  await expect(shell).toBeVisible();
  await expect(rendererHost).toBeVisible();
  await expect(rendererHost.getByText('CHAMPIONSHIP NIGHT')).toBeVisible();

  for (const elementId of [
    'el-show-title',
    'el-stage-bg',
    'el-video-wall',
    'el-accent-svg',
    'el-accent-arc',
    'el-sponsor-logo',
    'el-scorebug',
    'el-promo-qr',
    'el-clock',
    'el-hero-badge',
    'el-ticker',
  ]) {
    await expect(page.locator(`[data-element-id="${elementId}"]`)).toBeVisible();
  }

  const shellBox = await shell.boundingBox();
  const viewport = page.viewportSize();

  expect(Math.round(shellBox?.width ?? 0)).toBeGreaterThanOrEqual(viewport?.width ?? 0);
  expect(Math.round(shellBox?.height ?? 0)).toBeGreaterThanOrEqual(viewport?.height ?? 0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
});
