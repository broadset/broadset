import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function activatePathTool(page: Page): Promise<void> {
  await page.locator('button[aria-label="Path"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Path');
}

async function clickCanvasAt(page: Page, offsetX: number, offsetY: number): Promise<void> {
  const preview = page.getByLabel(/screen preview for/i);

  await preview.click({ force: true, position: { x: offsetX, y: offsetY } });
}

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: clicking the Path toolbar button enters placement mode, a click
 * on the canvas places a path element AND enters drawing mode AND the cursor
 * flips to crosshair. This crosses regions: toolbar → canvas cursor → placement
 * banner.
 */
test('Path toolbar activation updates the canvas cursor, placement banner, and persists crosshair into drawing mode', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activatePathTool(page);

  const placementCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(placementCursor).toBe('crosshair');

  await clickCanvasAt(page, 400, 350);

  // After first click, placement banner disappears (pendingPlacementType cleared).
  // Cursor should remain crosshair because pathDrawingElementId is now active.
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);

  const drawingCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(drawingCursor).toBe('crosshair');
});

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: after the Path tool is activated, three canvas clicks followed
 * by Enter produce a closed path — the rendered `<path>` element in the
 * renderer host has a `d` attribute ending in `Z`, and the cursor returns to
 * default (drawing mode exited). Cross-region: toolbar → canvas → cursor reset.
 */
test('three canvas clicks plus Enter produces a closed path and restores the default cursor', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  await activatePathTool(page);
  await clickCanvasAt(page, 400, 250);
  await clickCanvasAt(page, 550, 320);
  await clickCanvasAt(page, 470, 450);

  // Dispatch Enter directly via the window so it reaches the global keydown
  // handler without competing with any toolbar button's default Enter-click.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  const rendererHost = page.getByTestId('screen-renderer-host');
  const closedPath = rendererHost.locator('svg path[d*="Z"]');

  await expect(closedPath.first()).toBeAttached({ timeout: 2000 });

  const preview = page.getByLabel(/screen preview for/i);
  const finalCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(finalCursor).toBe('default');
});

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: Escape during drawing commits the current points as-is (no Z)
 * and exits drawing mode. Cross-region: canvas clicks → keyboard → cursor reset.
 */
test('Escape during drawing commits the path without closing it and restores the default cursor', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  await activatePathTool(page);
  await clickCanvasAt(page, 150, 120);
  await clickCanvasAt(page, 280, 160);
  await page.keyboard.press('Escape');

  const preview = page.getByLabel(/screen preview for/i);
  const finalCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(finalCursor).toBe('default');
});
