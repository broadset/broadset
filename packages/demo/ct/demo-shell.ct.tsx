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

/**
 * @description Validates the phase 3 playback scenario from
 * `project/spec/demo/data-integration.md` and `project/spec/demo/state.md`.
 */
test('playback controls animate, pause, resume, and reset the demo content', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const toggle = page.getByTestId('demo-playback-toggle');
  const reset = page.getByTestId('demo-playback-reset');
  const heroOpacity = page.locator('[data-element-id="el-hero-badge"] [data-opacity-target]');

  const initialOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Pause playback');
  await page.waitForTimeout(350);

  const animatedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(animatedOpacity).not.toBe(initialOpacity);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Play playback');

  const pausedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  await page.waitForTimeout(250);

  const pausedOpacityAfterWait = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(pausedOpacityAfterWait).toBe(pausedOpacity);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Pause playback');
  await page.waitForTimeout(180);

  const resumedOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(resumedOpacity).toBeGreaterThan(pausedOpacity);

  await toggle.click();
  await reset.click();

  const resetOpacity = Number(await heroOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(resetOpacity).toBe(initialOpacity);
});

/**
 * @description Validates the phase 3 playback-engine visibility scenario from
 * `project/spec/playback/playback.md` through the demo sample's IN/OUT bindings.
 * This is an engine integration check rather than a broader Phase 9 demo-workflow proof.
 */
test('playback engine applies the sample promo panel IN and OUT visibility bindings', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const promoPanel = page.locator('[data-element-id="el-promo-panel"]');
  const promoOpacity = page.locator('[data-element-id="el-promo-panel"] > [data-opacity-target]');

  await expect(promoPanel).toBeVisible();

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'offscreen');
  });
  await page.waitForTimeout(80);

  const outOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(outOpacity).toBeLessThan(1);

  await page.waitForTimeout(650);
  await expect(promoPanel).toHaveCSS('visibility', 'hidden');

  await promoPanel.evaluate((element) => {
    element.setAttribute('data-visibility', 'onscreen');
  });
  await page.waitForTimeout(80);
  await expect(promoPanel).toHaveCSS('visibility', 'visible');

  const inOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(inOpacity).toBeLessThan(1);

  await page.waitForTimeout(950);

  const settledOpacity = Number(await promoOpacity.evaluate((element) => getComputedStyle(element).opacity));

  expect(settledOpacity).toBeCloseTo(1, 1);
});

/**
 * @description Validates the Phase 4 demo-shell layout and visual contracts from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md`.
 */
test('renders dark editor chrome with floating toolbars around the preview canvas', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-main-toolbar')).toBeVisible();
  await expect(page.getByTestId('demo-scene-sorter')).toBeVisible();
  await expect(page.getByTestId('demo-element-library')).toBeVisible();
  await expect(page.getByTestId('demo-properties-sidebar')).toBeVisible();
  await expect(page.getByTestId('screen-renderer-host')).toBeVisible();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

/**
 * @description Validates the Phase 4 toolbar-chrome contract from
 * `project/spec/demo/layout.md` and `project/spec/demo/visual.md` so the main toolbar uses icon-only controls with accessible labels rather than visible text buttons.
 */
test('uses icon-only main toolbar controls with accessible labels', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const toolbar = page.getByTestId('demo-main-toolbar');

  for (const label of ['File', 'View', 'Scenes', 'Help']) {
    await expect(toolbar.locator(`button[aria-label="${label}"]`).first()).toBeVisible();
    await expect(toolbar.getByText(new RegExp(`^${label}$`))).toHaveCount(0);
  }
});

/**
 * @description Verifies the Phase 4 shell keeps the sidebar inset correctly and clamps the canvas context menu within the viewport bounds.
 */
test('keeps the sidebar inset and the context menu within the visible viewport', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await expect(sidebar).toHaveCSS('top', '72px');
  await expect(sidebar).toHaveCSS('bottom', '72px');

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  await preview.click({
    button: 'right',
    position: {
      x: Math.max((previewBox?.width ?? 12) - 4, 4),
      y: Math.max((previewBox?.height ?? 12) - 4, 4),
    },
  });

  const contextMenu = page.getByTestId('demo-context-menu');

  await expect(contextMenu).toBeVisible();

  const shell = page.getByTestId('demo-shell');
  const shellRect = await shell.evaluate((element) => {
    const { bottom, left, right, top } = element.getBoundingClientRect();

    return { bottom, left, right, top };
  });
  const menuRect = await contextMenu.evaluate((element) => {
    const { bottom, left, right, top } = element.getBoundingClientRect();

    return { bottom, left, right, top };
  });

  expect(menuRect.left).toBeGreaterThanOrEqual(shellRect.left);
  expect(menuRect.top).toBeGreaterThanOrEqual(shellRect.top);
  expect(menuRect.right).toBeLessThanOrEqual(shellRect.right);
  expect(menuRect.bottom).toBeLessThanOrEqual(shellRect.bottom);
});

/**
 * @description Validates the Phase 4 placement-mode affordance from
 * `project/spec/demo/layout.md` so activating a tool shows a clear banner and cancel path.
 */
test('shows a placement-mode banner when the user activates an element tool', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  await page.locator('button[aria-label="Cancel placement"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();
});
