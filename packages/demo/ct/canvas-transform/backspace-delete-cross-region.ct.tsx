import { expect, test } from '@playwright/experimental-ct-react';

import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

/* ------------------------------------------------------------------ */
/*  Backspace deletes the selected element across canvas + widget +    */
/*  properties + layers — closes CRA-2.18.                             */
/* ------------------------------------------------------------------ */

/**
 * @description Validates `project/spec/editor/keyboard.md` Delete Action
 * (Backspace bullet): pressing Backspace with an element selected MUST
 * remove the element from the canvas, hide the transform widget, clear
 * the properties panel, and remove the corresponding row from the
 * layers panel. The existing `Delete` key test only covers the canvas
 * + widget pair — Backspace MUST mirror it across all four regions.
 */
test('Backspace removes the selected element across canvas, widget, properties, and layers', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  // Select the Goal Icon via the layers panel — avoids any transform-widget
  // intercept that the canvas-click path could otherwise hit.
  await page.getByRole('tab', { name: 'Layers' }).click();

  const sidebar = page;
  const layerRow = sidebar.locator('[role="button"]', { hasText: FIXTURE_LAYER_LABELS.accentSvg });

  await layerRow.click();

  const svgElement = page.locator(`[data-element-id="${FIXTURE_IDS.accentSvg}"]`);
  const widget = page.getByTestId('demo-transform-widget');

  await expect(svgElement).toBeVisible();
  await expect(widget).toBeVisible();
  await expect(layerRow).toBeVisible();

  // Confirm the Properties tab button starts enabled (the auto-selection on
  // mount populates the Properties view), so we can later assert that
  // deletion disables it.
  const propertiesTab = page.getByRole('tab', { name: 'Properties' });

  await expect(propertiesTab).toBeEnabled();

  await page.keyboard.press('Backspace');

  // 1. Canvas: element node is gone.
  await expect(svgElement).toHaveCount(0);
  // 2. Transform widget: hidden because nothing is selected.
  await expect(widget).toHaveCount(0);
  // 3. Layers panel: the row no longer renders.
  await expect(layerRow).toHaveCount(0);
  // 4. Properties tab transitions to disabled — the demo's
  //    `isDisabled={selectedElement === null}` rule means the cleared
  //    selection is mirrored in the toolbar tab state.
  await expect(propertiesTab).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Element name' })).toHaveCount(0);
});

test('Delete preserves a required native project element', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const requiredElement = page.locator(`[data-element-id="${FIXTURE_IDS.background}"]`).first();

  await requiredElement.dispatchEvent('pointerdown', { button: 0, buttons: 1 });
  await page.keyboard.press('Delete');

  await expect(requiredElement).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__broadsetProjectEditorStore
          ?.getState()
          .project.documents[0]?.elements.some(({ id }) => id === 'el-top-gradient'),
      ),
    )
    .toBe(true);
});
