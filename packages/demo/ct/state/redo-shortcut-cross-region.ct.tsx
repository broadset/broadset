import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';

/* ------------------------------------------------------------------ */
/*  Ctrl+Y redoes a previously undone delete across canvas + layers +  */
/*  properties — closes CRA-2.25.                                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates `project/spec/editor/keyboard.md` Undo and
 * Redo Shortcuts (Ctrl+Y bullet): after pressing Ctrl+Z to undo a
 * delete, pressing Ctrl+Y MUST re-apply the delete. The canvas node
 * MUST be removed again, the layers panel row MUST disappear, and
 * the Properties tab MUST transition to disabled (no-selection state).
 *
 * The undo step rehydrates the deleted element so the redo step has
 * something to redo; without it Ctrl+Y is a no-op.
 */
test('Ctrl+Y redoes a previously undone delete across canvas, layers, and properties', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');
  const layerRow = sidebar.locator('[role="button"]', { hasText: FIXTURE_LAYER_LABELS.accentSvg });

  await layerRow.click();

  const svgElement = page.locator(`[data-element-id="${FIXTURE_IDS.accentSvg}"]`);
  const propertiesTab = page.locator('button[aria-label="Properties"]').first();

  await expect(svgElement).toBeVisible();
  await expect(propertiesTab).toBeEnabled();

  // Step 1: delete to populate the redo stack via Ctrl+Z.
  await page.keyboard.press('Delete');
  await expect(svgElement).toHaveCount(0);
  await expect(layerRow).toHaveCount(0);

  // Step 2: undo brings the element back on the canvas and into the
  // layers panel. Selection is not part of the undoable transaction, so
  // we don't assert the Properties tab here — only that the element
  // exists again and is therefore available to redo.
  await page.keyboard.press('Control+z');
  await expect(svgElement).toBeVisible();
  await expect(layerRow).toBeVisible();

  // Step 3: redo — element must disappear again across canvas + layers,
  // proving that Ctrl+Y inverts the prior Ctrl+Z and re-applies the
  // delete transaction.
  await page.keyboard.press('Control+y');

  await expect(svgElement).toHaveCount(0);
  await expect(layerRow).toHaveCount(0);
  // After a redone delete, the previously selected element is gone, so
  // the Properties tab stays disabled — exactly mirroring the post-
  // delete state from Step 1.
  await expect(propertiesTab).toBeDisabled();
});
