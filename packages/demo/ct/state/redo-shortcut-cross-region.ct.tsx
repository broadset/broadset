import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';

test('Ctrl+Y redoes a previously undone delete across canvas, layers, and properties', async ({ mount, page }) => {
  await mount(<DemoApp />);
  await page.getByRole('tab', { name: 'Layers' }).click();

  const layerRow = page.getByRole('button', { name: `Select ${FIXTURE_LAYER_LABELS.accentSvg}` });
  const svgElement = page.locator(`[data-element-id="${FIXTURE_IDS.accentSvg}"]`);

  await layerRow.click();
  await expect(svgElement).toBeVisible();

  await page.keyboard.press('Delete');
  await expect(svgElement).toHaveCount(0);
  await expect(layerRow).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(svgElement).toBeVisible();
  await expect(layerRow).toBeVisible();

  await page.keyboard.press('Control+y');
  await expect(svgElement).toHaveCount(0);
  await expect(layerRow).toHaveCount(0);

  await expect(page.getByRole('tab', { name: 'Properties' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Element name' })).toHaveCount(0);
});
