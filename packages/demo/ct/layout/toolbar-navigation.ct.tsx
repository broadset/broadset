import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` undo/redo state rules:
 * both controls start disabled, an edit enables Undo, and undo enables Redo.
 */
test('undo and redo buttons update disabled states after an edit and undo', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

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
  await mount(<DemoAppFresh />);

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
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  const placementCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(placementCursor).toBe('crosshair');

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  await expect.poll(async () => page.getByTestId('placement-mode-banner').isVisible()).toBe(false);
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-06 +
 * `project/spec/editor/editing.md` C-07: built-in and plugin library tools
 * activate placement mode and expose clear placement affordances.
 */
test('element library built-ins and plugin tools activate placement mode', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.locator('button[aria-label="Text"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Text');

  await page.locator('button[aria-label="Cancel placement"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();

  await page.locator('button[aria-label="Countdown"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Countdown');
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-03: File/Help menu
 * actions open the expected dialogs and each dialog can be closed by keyboard or controls.
 */
test('file and help menu actions open the expected dialogs', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await openToolbarMenu(page, 'File');
  await page.getByText('New Document').first().click();
  await expect(page.getByRole('dialog', { name: 'New Document' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New Document' })).toHaveCount(0);

  await openToolbarMenu(page, 'File');
  await page.getByText('Media Library').first().click();
  await expect(page.getByRole('dialog', { name: 'Media Library' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Media Library' })).toHaveCount(0);

  await openToolbarMenu(page, 'File');
  await page.getByText('Export').first().click();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Export' })).toHaveCount(0);

  await openToolbarMenu(page, 'File');
  await page.getByText('Document Settings').first().click();
  await expect(page.getByRole('dialog', { name: 'Canvas Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog', { name: 'Canvas Settings' })).toHaveCount(0);

  await openToolbarMenu(page, 'Help');
  await page.getByText('Keyboard shortcuts').first().click();
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0);

  await openToolbarMenu(page, 'Help');
  await page.getByText('About').first().click();

  const aboutDialog = page.getByRole('dialog', { name: 'Broadset' });

  await expect(aboutDialog).toBeVisible();
  await aboutDialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Broadset' })).toHaveCount(0);
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-04: View menu toggles
 * update ruler overlay visibility and can restore overlays after toggling.
 */
test('view menu toggles hide and restore ruler overlays', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(1);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(1);

  await openToolbarMenu(page, 'View');
  await page.getByText('Show rulers').first().click();

  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(0);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(0);

  await openToolbarMenu(page, 'View');
  await page.getByText('Show rulers').first().click();

  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(1);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(1);
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-05: Scenes menu can
 * switch active scene content and run add/remove scene actions.
 */
test('scenes menu switches content and supports add/remove actions', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await openToolbarMenu(page, 'Scenes');
  await page.getByText(FIXTURE_LAYER_LABELS.finalScene).first().click();

  await openToolbarMenu(page, 'Scenes');

  const halfTimeScene = page.getByRole('menuitem', { name: new RegExp(FIXTURE_LAYER_LABELS.finalScene, 'i') }).first();

  await expect(halfTimeScene.locator('svg').first()).toBeVisible();

  await page.getByText('Add scene').first().click();
  await expect(page.getByText('Added a new scene.')).toBeVisible();

  await openToolbarMenu(page, 'Scenes');
  await page.getByText('Remove scene').first().click();
  await expect(page.getByText('Removed the current scene.')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-07: empty-canvas
 * context menu is paste-only while element context menu exposes element actions.
 */
test('canvas context menu differs between selected-element and empty-canvas states', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Expected preview bounding box');
  }

  await preview.click({
    button: 'right',
    position: { x: previewBox.width / 2, y: previewBox.height / 2 },
  });

  await expect(page.getByText('Cut')).toBeVisible();
  await expect(page.getByText('Delete')).toBeVisible();

  await preview.dispatchEvent('click');
  await expect(page.getByTestId('transform-bounds')).toHaveCount(0);
  await preview.dispatchEvent('contextmenu', { button: 2 });

  await expect(page.getByText('Paste')).toBeVisible();
  await expect(page.getByText('Cut')).toHaveCount(0);
  await expect(page.getByText('Delete')).toHaveCount(0);
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-08 and T-09 context
 * constraints: locking switches label to Unlock and multi-selection reveals group actions.
 */
test('context menu reflects lock state and multi-select group actions', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);
  const contextMenu = page.getByTestId('demo-context-menu');

  const badgeElement = preview.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`).first();
  const clockElement = preview.locator(`[data-element-id="${FIXTURE_IDS.clock}"]`).first();

  await expect(badgeElement).toBeVisible();
  await expect(clockElement).toBeVisible();

  await badgeElement.click({ button: 'right', force: true });
  await expect(contextMenu).toBeVisible();
  await page.getByRole('menuitem').filter({ hasText: /^Lock/ }).first().click();

  await badgeElement.click({ button: 'right', force: true });
  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /^Unlock/ })
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await badgeElement.click({ force: true });
  await clockElement.click({ force: true, modifiers: ['Meta'] });
  await badgeElement.click({ button: 'right', force: true });

  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /^Group/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /^Ungroup/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /^Bring forward/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /^Send backward/ })
      .first(),
  ).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-10 keyboard access:
 * main toolbar controls are focusable and open menus using keyboard activation.
 */
test('main toolbar supports keyboard activation on menu controls', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const toolbar = page.getByLabel('Main editor toolbar');
  const fileButton = page.locator('button[aria-label="File"]').first();

  await expect(toolbar).toBeVisible();
  await fileButton.focus();
  await expect(fileButton).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByText('New Document')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByText('New Document')).toHaveCount(0);
});
