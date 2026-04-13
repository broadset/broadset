import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../src/DemoApp';

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` undo/redo state rules:
 * both controls start disabled, an edit enables Undo, and undo enables Redo.
 */
test('undo and redo buttons update disabled states after an edit and undo', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const undoButton = page.locator('button[aria-label="Undo"]').first();
  const redoButton = page.locator('button[aria-label="Redo"]').first();

  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Transform bounds box not found');
  }

  const startX = boundsBox.x + boundsBox.width / 2;
  const startY = boundsBox.y + boundsBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();

  await undoButton.click();

  await expect(redoButton).toBeEnabled();
});

/**
 * @description Validates `project/spec/editor/canvas.md` zoom clamp behavior:
 * toolbar zoom controls clamp at max 400% and min 10% with visible percentage feedback.
 */
test('toolbar zoom controls clamp at 400% max and 10% min', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const zoomIn = page.locator('button[aria-label="Zoom in"]').first();
  const zoomOut = page.locator('button[aria-label="Zoom out"]').first();
  const zoomLevel = page.getByLabel('Zoom level');

  for (let i = 0; i < 40; i += 1) {
    await zoomIn.click();
  }

  await expect(zoomLevel).toHaveText('400%');

  for (let i = 0; i < 80; i += 1) {
    await zoomOut.click();
  }

  await expect(zoomLevel).toHaveText('10%');
});

/**
 * @description Validates `project/spec/editor/editing.md` + `project/spec/demo/layout.md`:
 * Escape cancels placement mode, hides the banner, and restores the default preview cursor.
 */
test('Escape cancels placement mode and restores default preview cursor', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const preview = page.getByLabel(/screen preview for/i);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  const placementCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(placementCursor).toBe('crosshair');

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
});
