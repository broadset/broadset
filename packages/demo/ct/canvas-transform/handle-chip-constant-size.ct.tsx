import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function setCanvasZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((nextZoom) => {
    const state = window.__broadsetProjectEditorStore?.getState();

    if (state === undefined) {
      throw new Error('Expected demo editor store');
    }

    state.updateCanvasSettings({ zoom: nextZoom, panX: 0, panY: 0 });
  }, zoom);

  await expect(page.getByLabel('Zoom level')).toHaveText(`${String(Math.round(zoom * 100))}%`);
}

async function readHandleSize(
  page: Page,
  testId: string,
): Promise<{ readonly width: number; readonly height: number }> {
  const box = await page.getByTestId(testId).boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} bounding box`);
  }

  return { width: box.width, height: box.height };
}

/**
 * @description Validates `project/spec/editor/canvas.md` Transform Widget:
 * resize and rotation handle chips must keep a constant on-screen size across
 * zoom levels.
 */
test('transform handles keep constant on-screen size across zoom levels', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const liveDot = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"]`);

  await expect(liveDot).toBeVisible();
  await liveDot.dispatchEvent('click', { bubbles: true });
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const zoomSteps = [0.5, 1, 2, 4] as const;
  const resizeWidths: number[] = [];
  const resizeHeights: number[] = [];
  const rotationWidths: number[] = [];
  const rotationHeights: number[] = [];

  for (const zoom of zoomSteps) {
    await setCanvasZoom(page, zoom);

    const resizeHandle = await readHandleSize(page, 'transform-handle-se');
    const rotationHandle = await readHandleSize(page, 'transform-rotation-handle');

    resizeWidths.push(resizeHandle.width);
    resizeHeights.push(resizeHandle.height);
    rotationWidths.push(rotationHandle.width);
    rotationHeights.push(rotationHandle.height);
  }

  expect(Math.max(...resizeWidths) - Math.min(...resizeWidths)).toBeLessThanOrEqual(1);
  expect(Math.max(...resizeHeights) - Math.min(...resizeHeights)).toBeLessThanOrEqual(1);
  expect(Math.max(...rotationWidths) - Math.min(...rotationWidths)).toBeLessThanOrEqual(1);
  expect(Math.max(...rotationHeights) - Math.min(...rotationHeights)).toBeLessThanOrEqual(1);
});
