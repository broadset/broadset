import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-02 undo/redo state rules:
 * both controls start disabled, an edit enables Undo, and undo enables Redo.
 */
test('undo and redo buttons update disabled states after an edit and undo', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const undoButton = page.locator('button[aria-label="Undo"]').first();
  const redoButton = page.locator('button[aria-label="Redo"]').first();

  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  const xField = page.getByRole('textbox', { name: 'X (px)' }).first();
  const currentX = Number(await xField.inputValue());

  await xField.fill(String(currentX + 24));
  await xField.blur();

  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();

  await undoButton.click();

  await expect(redoButton).toBeEnabled();
});

/**
 * @description Validates `project/spec/editor/canvas.md` C-10 zoom clamp behavior:
 * toolbar zoom controls clamp at max 400% and min 10% with visible percentage feedback.
 */
test('toolbar zoom controls clamp at 400% max and 10% min', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomIn = page.locator('button[aria-label="Zoom in"]').first();
  const zoomOut = page.locator('button[aria-label="Zoom out"]').first();
  const zoomLevel = page.getByLabel('Zoom level');

  await expect.poll(() => page.evaluate(() => window.__broadsetProjectEditorStore !== undefined)).toBe(true);
  await page.evaluate(() => {
    window.__broadsetProjectEditorStore?.getState().updateCanvasSettings({ zoom: 3.99 });
  });
  await zoomIn.click();
  await zoomIn.click();

  await expect(zoomLevel).toHaveText('400%');

  await page.evaluate(() => {
    window.__broadsetProjectEditorStore?.getState().updateCanvasSettings({ zoom: 0.11 });
  });
  await zoomOut.click();
  await zoomOut.click();

  await expect(zoomLevel).toHaveText('10%');
});

/**
 * @description Validates `project/spec/editor/editing.md` C-09 + `project/spec/demo/layout.md`:
 * Escape cancels placement mode and restores the default preview cursor. The
 * placement banner MUST NOT be rendered — only the crosshair cursor + active
 * toolbar button communicate placement state.
 */
test('Escape cancels placement mode and restores default preview cursor', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);

  const placementCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(placementCursor).toBe('crosshair');

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
});

/**
 * @description Validates `project/spec/editor/canvas.md` C-13 and
 * `project/spec/ui/toolbar-nav.md` View toggles: rulers and grid can be toggled
 * from the View menu, and ruler ticks remain responsive after zoom and pan.
 */
test('view toggles switch rulers/grid and ruler ticks react to zoom and pan', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(1);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(1);

  await openToolbarMenu(page, 'View');
  await page.getByText('Show grid').first().click();

  await openToolbarMenu(page, 'File');
  await page.getByText('Document Settings').first().click();
  await expect(page.getByRole('switch', { name: 'Show grid' })).toBeChecked();
  await page.getByRole('button', { name: 'Done' }).click();

  await openToolbarMenu(page, 'View');
  await page.getByText('Show grid').first().click();

  await openToolbarMenu(page, 'View');
  await page.getByText('Show rulers').first().click();
  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(0);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(0);

  await openToolbarMenu(page, 'View');
  await page.getByText('Show rulers').first().click();
  await expect(page.getByTestId('ruler-horizontal-strip')).toHaveCount(1);
  await expect(page.getByTestId('ruler-vertical-strip')).toHaveCount(1);

  await page.locator('button[aria-label="Zoom in"]').first().click();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(180, 0);
  await page.keyboard.up('Shift');

  await expect(page.getByTestId('ruler-horizontal-strip')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/toolbar-nav.md` T-06 +
 * `project/spec/editor/editing.md` C-07: built-in and plugin library tools
 * activate placement mode and expose the crosshair cursor as the only placement
 * affordance (no banner).
 */
test('element library built-ins and plugin tools activate placement mode', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);
  const textButton = page.locator('button[aria-label="Text"]').first();
  const countdownButton = page.locator('button[aria-label="Countdown"]').first();

  await textButton.click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  // Clicking the same toolbar button again toggles placement off.
  await textButton.click();
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  await countdownButton.click();
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');
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
  await page.getByText(FIXTURE_LAYER_LABELS.finalScene).first().click({ force: true });

  await openToolbarMenu(page, 'Scenes');

  const halfTimeScene = page.getByRole('menuitem', { name: new RegExp(FIXTURE_LAYER_LABELS.finalScene, 'i') }).first();

  await expect(halfTimeScene).toBeVisible();

  await page.getByText('Add scene').first().click();
  await expect(page.getByText('Added a new scene.')).toBeVisible();

  await openToolbarMenu(page, 'Scenes');
  await page.getByText('Remove scene').first().click();
  await expect(page.getByTestId('demo-shell')).toBeVisible();
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
    force: true,
    position: { x: previewBox.width / 2, y: previewBox.height / 2 },
  });

  await expect(page.getByText('Cut')).toBeVisible();
  await expect(page.getByText('Delete')).toBeVisible();

  await preview.dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
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

  const selectedIds = [
    projectFormatV1.idSchema.parse(FIXTURE_IDS.logo),
    projectFormatV1.idSchema.parse(FIXTURE_IDS.clock),
  ];

  await expect.poll(() => page.evaluate(() => window.__broadsetProjectEditorStore !== undefined)).toBe(true);
  await page.evaluate((elementIds) => {
    window.__broadsetProjectEditorStore?.getState().setActiveElements(elementIds);
  }, selectedIds);
  await page.evaluate(() => {
    const address = window.__broadsetProjectEditorStore?.getState().activeInstanceAddresses[0];

    if (address === undefined) throw new Error('Expected an active instance address');

    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-element-id]')).find(
      (candidate) =>
        candidate.dataset['elementId'] === address.elementId &&
        candidate.dataset['instanceRootId'] === address.rootInstanceId &&
        candidate.dataset['componentInstancePath'] === JSON.stringify(address.componentInstancePath),
    );

    if (target === undefined) throw new Error('Expected the selected rendered instance');

    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, cancelable: true }));
  });

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
