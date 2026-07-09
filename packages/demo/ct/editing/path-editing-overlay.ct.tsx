import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { clickCanvasPoint, getCanvasRootRect, waitForPlacementType } from '../canvas-transform/helpers';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function getLatestPathVertexCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hosts = document.querySelectorAll<HTMLElement>('[data-testid="screen-renderer-host"] [data-element-id]');

    for (let index = hosts.length - 1; index >= 0; index -= 1) {
      const host = hosts[index];

      if (host === undefined) continue;

      const path = host.querySelector<SVGPathElement>('svg path[d]');

      if (path !== null) {
        return (path.getAttribute('d') ?? '').match(/[ML]/g)?.length ?? 0;
      }
    }

    return 0;
  });
}

async function isPathDrawingActive(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __broadsetEditorStore?: {
          getState: () => { readonly pathDrawingElementId: string | null };
        };
      }
    ).__broadsetEditorStore;

    return (store?.getState().pathDrawingElementId ?? null) !== null;
  });
}

async function clickAndWaitForVertex(page: Page, x: number, y: number, expectedVertexCount: number): Promise<void> {
  await clickCanvasPoint(page, x, y);
  await expect
    .poll(async () => {
      const [vertexCount, drawingActive, widgetCount] = await Promise.all([
        getLatestPathVertexCount(page),
        isPathDrawingActive(page),
        page.getByTestId('demo-transform-widget').count(),
      ]);

      return {
        ready:
          vertexCount >= expectedVertexCount && (expectedVertexCount === 1 ? drawingActive && widgetCount === 0 : true),
      };
    })
    .toMatchObject({ ready: true });
}

async function drawThreePointPath(page: Page): Promise<void> {
  await page.locator('button[aria-label="Path"]').first().click();
  await waitForPlacementType(page, 'placement-anchor');

  const canvasRect = await getCanvasRootRect(page);

  // The first canvas click places the (empty-content) path element; the next
  // clicks append M/L/L via appendPathPoint. Enter closes with Z. Coordinates
  // are clamped within the preview's actual bounds so the resulting element
  // lies inside the canvas and its handles are visible to drag in later tests.
  const points: ReadonlyArray<{ x: number; y: number }> = [
    { x: canvasRect.x + canvasRect.width * 0.3, y: canvasRect.y + canvasRect.height * 0.3 },
    { x: canvasRect.x + canvasRect.width * 0.4, y: canvasRect.y + canvasRect.height * 0.3 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.4, y: canvasRect.y + canvasRect.height * 0.55 },
  ];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (point === undefined) continue;
    await clickAndWaitForVertex(page, point.x, point.y, index + 1);
  }

  // Dispatch Enter directly via window to avoid re-triggering the last-focused
  // toolbar button's default Enter-click.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

async function rightClickOnSelection(page: Page): Promise<void> {
  // After drawing, the new path is the selected element. Dispatch the
  // contextmenu event directly on the preview so the React handler fires
  // without engaging the browser's native context menu.
  const preview = page.getByLabel(/screen preview for/i);

  await preview.dispatchEvent('contextmenu', { button: 2, clientX: 10, clientY: 10 });
}

/**
 * @description Validates `project/spec/editor/editing.md` § Path Editing Canvas
 * Overlay: after drawing a triangle path, invoking "Edit path points" from the
 * canvas context menu renders a draggable SVG overlay with one anchor handle
 * per M/L segment (and a Z segment adds no new anchor). Cross-region: canvas
 * context menu → canvas overlay.
 */
test('entering path edit mode renders anchor handles on the canvas overlay', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await drawThreePointPath(page);
  await rightClickOnSelection(page);

  const menu = page.getByTestId('demo-context-menu');

  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /edit path points/i }).click();

  await expect(page.getByTestId('path-editing-overlay')).toBeVisible();
  // The drawn path has at least two anchor handles (one per on-curve point);
  // no Bézier segments → no control handles.
  await expect(page.locator('[data-testid^="path-handle-anchor-"]').first()).toBeVisible();
  await expect.poll(async () => page.locator('[data-testid^="path-handle-anchor-"]').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-testid^="path-handle-control-"]')).toHaveCount(0);
});

/**
 * @description Validates `project/spec/editor/editing.md` § Path Editing Mode:
 * pressing Escape while path editing is active stops the editing session and
 * removes the overlay from the canvas. Cross-region: keyboard → canvas
 * overlay cleanup.
 */
test('Escape exits path edit mode and removes the canvas overlay', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await drawThreePointPath(page);
  await rightClickOnSelection(page);
  await page
    .getByTestId('demo-context-menu')
    .getByRole('menuitem', { name: /edit path points/i })
    .click();

  await expect(page.getByTestId('path-editing-overlay')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  await expect(page.getByTestId('path-editing-overlay')).toHaveCount(0);
});
