import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

interface ActiveElementSnapshot {
  readonly id: string;
  readonly name: string;
}

async function placeRectangle(page: Page): Promise<void> {
  const preview = page.getByLabel(/screen preview for/i);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Expected screen preview bounds');
  }

  await preview.click({ force: true, position: { x: previewBox.width * 0.35, y: previewBox.height * 0.35 } });
  await preview.click({ force: true, position: { x: previewBox.width * 0.62, y: previewBox.height * 0.58 } });

  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
}

async function readActiveElementSnapshot(page: Page): Promise<ActiveElementSnapshot> {
  return page.evaluate(() => {
    interface BrowserElement {
      readonly id: string;
      readonly name: string;
    }

    interface BrowserStoreState {
      readonly activeElementIds: readonly string[];
      readonly document: {
        readonly elements: readonly BrowserElement[];
      };
    }

    interface BrowserStore {
      readonly getState: () => BrowserStoreState;
    }

    const store = (window as unknown as { __broadsetEditorStore?: BrowserStore }).__broadsetEditorStore;
    const state = store?.getState();
    const activeElementId = state?.activeElementIds[0];

    if (state === undefined || typeof activeElementId !== 'string') {
      throw new Error('Expected selected element after placement');
    }

    const activeElement = state.document.elements.find((entry) => entry.id === activeElementId);

    if (activeElement === undefined) {
      throw new Error(`Selected element ${activeElementId} was not found in the document`);
    }

    return {
      id: activeElement.id,
      name: activeElement.name,
    };
  });
}

/**
 * @description Validates `project/spec/editor/canvas.md` Interleaved Mutation
 * Stability: add -> remove -> undo keeps canvas/layers/properties coherent and
 * restores the deleted element identity without orphaned UI state.
 */
test('interleaved add remove undo keeps canvas layers and properties in sync', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');
  const layerRows = sidebar.locator('[role="button"][aria-label^="Select "]');
  const propertiesTab = page.locator('button[aria-label="Properties"]').first();
  const baselineLayerCount = await layerRows.count();

  await placeRectangle(page);

  const created = await readActiveElementSnapshot(page);
  const renamedLayerName = `Interleaved ${created.name}`;

  await page.locator('button[aria-label="Properties"]').first().click();
  await page.getByRole('textbox', { name: 'Element name' }).fill(renamedLayerName);
  await page.keyboard.press('Enter');

  await page.locator('button[aria-label="Layers"]').first().click();

  const createdElement = page.locator(`[data-element-id="${created.id}"]`);
  const createdLayerRow = sidebar.getByRole('button', { name: `Select ${renamedLayerName}`, exact: true });

  await expect(createdElement).toHaveCount(1);
  await expect(createdLayerRow).toBeVisible();
  await expect(layerRows).toHaveCount(baselineLayerCount + 1);

  await createdLayerRow.click();
  await page.keyboard.press('Delete');

  await expect(createdElement).toHaveCount(0);
  await expect(createdLayerRow).toHaveCount(0);
  await expect(layerRows).toHaveCount(baselineLayerCount);
  await expect(propertiesTab).toBeDisabled();

  await page.keyboard.press('Control+z');

  await expect(createdElement).toHaveCount(1);
  await expect(createdLayerRow).toBeVisible();
  await expect(layerRows).toHaveCount(baselineLayerCount + 1);

  await createdLayerRow.click();
  await expect(propertiesTab).toBeEnabled();
  await propertiesTab.click();
  await expect(page.getByRole('textbox', { name: 'Element name' })).toHaveValue(renamedLayerName);
});
