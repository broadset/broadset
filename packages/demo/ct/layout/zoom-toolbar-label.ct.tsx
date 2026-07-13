import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

interface ViewportSnapshot {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

async function moveMouseToPreviewCenter(page: Page): Promise<void> {
  const preview = page.getByLabel(/screen preview for/i);
  const box = await preview.boundingBox();

  if (box === null) {
    throw new Error('Expected screen preview bounds');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function readViewportSnapshot(page: Page): Promise<ViewportSnapshot> {
  return page.evaluate(() => {
    const settings = window.__broadsetProjectEditorStore?.getState().canvasSettings;

    if (settings === undefined) throw new Error('Expected v1 project editor store');

    return { panX: settings.panX, panY: settings.panY, zoom: settings.zoom };
  });
}

/**
 * @description Validates `project/spec/editor/canvas.md` Zoom and Pan:
 * each wheel-zoom tick updates both the canvas viewport zoom and the toolbar
 * percentage label in lockstep.
 */
test('mouse-wheel zoom updates toolbar percentage label on every tick', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomLevel = page.getByLabel('Zoom level');

  await expect(zoomLevel).toHaveText('100%');
  await moveMouseToPreviewCenter(page);

  await page.mouse.wheel(0, -120);
  await expect(zoomLevel).toHaveText('124%');
  await expect.poll(async () => Math.round((await readViewportSnapshot(page)).zoom * 100)).toBe(124);

  await page.mouse.wheel(0, -120);
  await expect(zoomLevel).toHaveText('148%');
  await expect.poll(async () => Math.round((await readViewportSnapshot(page)).zoom * 100)).toBe(148);

  await page.mouse.wheel(0, 120);
  await expect(zoomLevel).toHaveText('124%');
  await expect.poll(async () => Math.round((await readViewportSnapshot(page)).zoom * 100)).toBe(124);
});
