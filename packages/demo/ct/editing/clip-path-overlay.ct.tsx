import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function selectUnlockedRectangle(page: Page): Promise<void> {
  // Activate the Rectangle tool and place one inside the canvas so the shell
  // enters clip-path editing mode on an element we control (and know is
  // unlocked). This keeps the test independent of which sample fixture
  // elements happen to expose the clipPath capability.
  await page.locator('button[aria-label="Rectangle"]').first().click();

  const preview = page.getByLabel(/screen preview for/i);
  const box = await preview.boundingBox();

  if (box === null) throw new Error('Preview has no bounding box');

  await preview.click({
    force: true,
    position: { x: box.width * 0.4, y: box.height * 0.4 },
  });
}

async function openElementContextMenuViaRightClick(page: Page): Promise<void> {
  const preview = page.getByLabel(/screen preview for/i);

  await preview.dispatchEvent('contextmenu', { button: 2, clientX: 10, clientY: 10 });
}

/**
 * @description Validates `project/spec/editor/editing.md` § Clip-Path Editing
 * Mode: invoking "Edit clip path" from the context menu on an element with the
 * clipPath capability seeds a default rectangular polygon and renders four
 * draggable polygon handles on the canvas overlay. Cross-region: canvas
 * context menu → canvas overlay.
 */
test('entering clip-path edit mode renders four polygon handles on the canvas overlay', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await selectUnlockedRectangle(page);
  await openElementContextMenuViaRightClick(page);
  await page
    .getByTestId('demo-context-menu')
    .getByRole('menuitem', { name: /edit clip path/i })
    .click();

  await expect(page.getByTestId('clip-path-editing-overlay')).toBeVisible();
  // Default polygon is a 4-point rectangle: 0% 0%, 100% 0%, 100% 100%, 0% 100%.
  await expect(page.locator('[data-testid^="clip-path-handle-"]')).toHaveCount(4);
  // Four midpoint handles for edge-insertion affordance.
  await expect(page.locator('[data-testid^="clip-path-midpoint-"]')).toHaveCount(4);
});

/**
 * @description Validates `project/spec/editor/editing.md` § Clip-Path Editing
 * Mode: pressing Escape while clip-path editing is active stops the session
 * and unmounts the overlay. Cross-region: keyboard → canvas overlay cleanup.
 */
test('Escape exits clip-path edit mode and removes the overlay', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await selectUnlockedRectangle(page);
  await openElementContextMenuViaRightClick(page);
  await page
    .getByTestId('demo-context-menu')
    .getByRole('menuitem', { name: /edit clip path/i })
    .click();

  await expect(page.getByTestId('clip-path-editing-overlay')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  await expect(page.getByTestId('clip-path-editing-overlay')).toHaveCount(0);
});
