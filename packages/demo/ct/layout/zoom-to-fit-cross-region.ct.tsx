import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

interface ViewportSnapshot {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
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
    const panLayer = document.querySelector<HTMLElement>('[data-testid="screen-pan-layer"]');
    const host = document.querySelector<HTMLElement>('[data-testid="screen-renderer-host"]');

    if (panLayer === null || host === null) {
      throw new Error('Expected screen preview pan and host layers');
    }

    const panMatch = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(panLayer.style.transform);
    const zoomMatch = /scale\(([-\d.]+)\)/.exec(host.style.transform);

    if (panMatch === null || zoomMatch === null) {
      throw new Error(`Unexpected viewport transform styles: ${panLayer.style.transform} / ${host.style.transform}`);
    }

    const [, panXText, panYText] = panMatch;
    const [, zoomText] = zoomMatch;

    if (panXText === undefined || panYText === undefined || zoomText === undefined) {
      throw new Error(
        `Missing viewport transform capture groups: ${panLayer.style.transform} / ${host.style.transform}`,
      );
    }

    return {
      panX: Number.parseFloat(panXText),
      panY: Number.parseFloat(panYText),
      zoom: Number.parseFloat(zoomText),
    };
  });
}

/**
 * @description Validates `project/spec/editor/canvas.md` Zoom and Pan:
 * View -> Zoom to Fit must reset the canvas viewport and sync the toolbar
 * percentage label back to the fit value.
 */
test('view menu Zoom to Fit resets canvas viewport and toolbar zoom label', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomLevel = page.getByLabel('Zoom level');

  await expect(zoomLevel).toHaveText('100%');
  await moveMouseToPreviewCenter(page);

  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);

  await page.keyboard.down('Shift');
  await page.mouse.wheel(180, 0);
  await page.keyboard.up('Shift');

  await expect(zoomLevel).toHaveText('148%');
  await expect
    .poll(async () => {
      const snapshot = await readViewportSnapshot(page);

      return {
        hasPanOffset: Math.abs(snapshot.panX) > 0 || Math.abs(snapshot.panY) > 0,
        zoomPercent: Math.round(snapshot.zoom * 100),
      };
    })
    .toEqual({ hasPanOffset: true, zoomPercent: 148 });

  await openToolbarMenu(page, 'View');
  await page
    .getByRole('menuitem', { name: /Zoom to Fit/i })
    .first()
    .click();

  await expect(zoomLevel).toHaveText('100%');
  await expect
    .poll(async () => {
      const snapshot = await readViewportSnapshot(page);

      return {
        panX: Math.round(snapshot.panX),
        panY: Math.round(snapshot.panY),
        zoomPercent: Math.round(snapshot.zoom * 100),
      };
    })
    .toEqual({ panX: 0, panY: 0, zoomPercent: 100 });
});
