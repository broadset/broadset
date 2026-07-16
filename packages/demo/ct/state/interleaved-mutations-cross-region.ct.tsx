import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

interface ActiveElementSnapshot {
  readonly id: string;
  readonly name: string;
}

async function placeRectangle(page: Page): Promise<void> {
  const preview = page.getByLabel(/screen preview for/i);

  await page.getByRole('button', { name: 'Rectangle' }).click();

  const previewBox = await preview.boundingBox();

  if (previewBox === null) throw new Error('Expected screen preview bounds');

  await preview.click({ force: true, position: { x: previewBox.width * 0.35, y: previewBox.height * 0.35 } });
  await preview.click({ force: true, position: { x: previewBox.width * 0.62, y: previewBox.height * 0.58 } });
  await expect.poll(() => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
}

async function readActiveElementSnapshot(page: Page): Promise<ActiveElementSnapshot> {
  return page.evaluate(() => {
    const state = window.__broadsetProjectEditorStore?.getState();
    const activeElementId = state?.activeInstanceAddresses[0]?.elementId;
    const activeElement = state?.project.documents[0]?.elements.find(({ id }) => id === activeElementId);

    if (activeElement === undefined) throw new Error('Expected selected element after placement');

    return { id: activeElement.id, name: activeElement.name };
  });
}

test('interleaved add remove undo keeps canvas layers and properties in sync', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await page.getByRole('tab', { name: 'Layers' }).click();

  const layerRows = page.locator('[role="button"][aria-label^="Select "]');
  const propertiesTab = page.getByRole('tab', { name: 'Properties' });
  const baselineLayerCount = await layerRows.count();

  await placeRectangle(page);

  const created = await readActiveElementSnapshot(page);
  const renamedLayerName = `Interleaved ${created.name}`;

  await propertiesTab.click();
  await page.getByRole('textbox', { name: 'Element name' }).fill(renamedLayerName);
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Layers' }).click();

  const createdElement = page.locator(`[data-element-id="${created.id}"]`);
  const createdLayerRow = page.getByRole('button', { name: `Select ${renamedLayerName}`, exact: true });

  await expect(createdElement).toHaveCount(1);
  await expect(createdLayerRow).toBeVisible();
  await expect(layerRows).toHaveCount(baselineLayerCount + 1);

  await createdLayerRow.click();
  await page.keyboard.press('Delete');
  await expect(createdElement).toHaveCount(0);
  await expect(createdLayerRow).toHaveCount(0);
  await expect(layerRows).toHaveCount(baselineLayerCount);

  await page.keyboard.press('Control+z');
  await expect(createdElement).toHaveCount(1);
  await expect(createdLayerRow).toBeVisible();
  await expect(layerRows).toHaveCount(baselineLayerCount + 1);

  await createdLayerRow.click();
  await propertiesTab.click();
  await expect(page.getByRole('textbox', { name: 'Element name' })).toHaveValue(renamedLayerName);
});
