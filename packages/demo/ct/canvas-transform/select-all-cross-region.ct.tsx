import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

/* ------------------------------------------------------------------ */
/*  Ctrl+A selects every element across canvas + layers + widget —     */
/*  closes CRA-2.19.                                                   */
/* ------------------------------------------------------------------ */

/**
 * @description Validates `project/spec/editor/keyboard.md` Select All:
 * pressing Ctrl+A MUST select every element on the active page. The
 * combined transform widget MUST appear over the union bounds of the
 * selected elements, and the layers panel MUST highlight every layer
 * row simultaneously.
 *
 * The single transform widget render proves combined-selection mode;
 * the multi-row layer highlight proves the cross-region propagation.
 */
test('Ctrl+A selects every element and updates canvas widget plus layers panel highlight', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Open the layers panel so we can observe the layer-row highlight state.
  await page.getByRole('tab', { name: 'Layers' }).click();

  const sidebar = page;
  const layerRows = sidebar.locator('[role="button"][aria-label^="Select "]');
  const totalLayers = await layerRows.count();

  expect(totalLayers).toBeGreaterThan(1);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Capture initial widget area — single-element selection at mount.
  const initialBox = await widget.boundingBox();

  if (initialBox === null) throw new Error('initial widget bbox not found');

  const initialArea = initialBox.width * initialBox.height;

  // Focus the document body so the global keyboard handler picks up
  // Ctrl+A instead of any sidebar-text-select default.
  await page.evaluate(() => {
    document.body.focus();
  });

  await page.keyboard.press('Control+a');

  // 1. Canvas region: combined widget remains visible AND grows to span
  //    the union of every element's bounds — multi-selection.
  await expect(widget).toBeVisible();
  await expect
    .poll(async () => {
      const box = await widget.boundingBox();

      if (box === null) return 0;

      return box.width * box.height;
    })
    .toBeGreaterThan(initialArea * 4);

  // 2. Layers panel: every layer row paints the "selected" surface
  //    background (computeRowBackground returns `surface-secondary` only
  //    when the row's element is in the active set). Reading computed
  //    styles makes the assertion robust against any future restyling
  //    of the active token — only the count of rows whose computed
  //    background diverges from the unselected default matters.
  const initialBackgroundCount = await layerRows.evaluateAll((rows) => {
    const li = rows.map((row) => row.closest('li'));
    const filtered = li.filter((node): node is HTMLLIElement => node !== null);
    const transparent = filtered.filter((node) => {
      const bg = window.getComputedStyle(node).backgroundColor;

      return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
    });

    return filtered.length - transparent.length;
  });

  expect(initialBackgroundCount).toBe(totalLayers);
});
