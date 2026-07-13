import { expect } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { clickCanvasPoint, getCanvasRootRect, waitForPlacementType } from '../canvas-transform/helpers';

export async function activatePathTool(page: Page): Promise<void> {
  await page.locator('button[aria-label="Path"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);
  await waitForPlacementType(page, 'placement-anchor');
}

export async function clickCanvasAt(page: Page, offsetX: number, offsetY: number): Promise<void> {
  const canvasRect = await getCanvasRootRect(page);

  await clickCanvasPoint(page, canvasRect.x + offsetX, canvasRect.y + offsetY);
}

export async function assertPathVerticesMatchClicks(
  page: Page,
  clicksAbsolute: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  tolerance: number,
): Promise<void> {
  const readVertices = await page.evaluate((): ReadonlyArray<{ readonly x: number; readonly y: number }> | null => {
    const hosts = document.querySelectorAll<HTMLElement>('[data-testid="v1-page-preview"] [data-element-id]');

    if (hosts.length === 0) return null;

    let pathElement: SVGPathElement | null = null;
    let elementHost: HTMLElement | null = null;

    for (let index = hosts.length - 1; index >= 0; index -= 1) {
      const host = hosts[index];

      if (host === undefined) continue;

      const candidatePath = host.querySelector<SVGPathElement>('svg path[d]');

      if (candidatePath !== null) {
        pathElement = candidatePath;
        elementHost = host;
        break;
      }
    }

    if (pathElement === null || elementHost === null) return null;

    const pathData = pathElement.getAttribute('d') ?? '';
    const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*|\s+)(-?\d+(?:\.\d+)?)/g;
    const hostRect = elementHost.getBoundingClientRect();
    const bboxX = elementHost.offsetWidth;
    const bboxY = elementHost.offsetHeight;
    const scaleX = bboxX > 0 ? hostRect.width / bboxX : 1;
    const scaleY = bboxY > 0 ? hostRect.height / bboxY : 1;
    const vertices: { readonly x: number; readonly y: number }[] = [];

    for (const match of pathData.matchAll(pointExpression)) {
      const relativeX = Number.parseFloat(match[2] ?? '0');
      const relativeY = Number.parseFloat(match[3] ?? '0');

      vertices.push({ x: hostRect.left + relativeX * scaleX, y: hostRect.top + relativeY * scaleY });
    }

    return vertices;
  });

  expect(readVertices).not.toBeNull();
  expect(readVertices).toHaveLength(clicksAbsolute.length);

  for (let index = 0; index < clicksAbsolute.length; index += 1) {
    const expectedClick = clicksAbsolute[index];
    const actualVertex = (readVertices ?? [])[index];

    if (expectedClick === undefined || actualVertex === undefined) {
      throw new Error(`Missing click or vertex at index ${String(index)}`);
    }

    expect(Math.abs(actualVertex.x - expectedClick.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(actualVertex.y - expectedClick.y)).toBeLessThanOrEqual(tolerance);
  }
}

async function getLatestPathVertexCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hosts = document.querySelectorAll<HTMLElement>('[data-testid="v1-page-preview"] [data-element-id]');

    for (let index = hosts.length - 1; index >= 0; index -= 1) {
      const host = hosts[index];

      if (host === undefined) continue;

      const path = host.querySelector<SVGPathElement>('svg path[d]');

      if (path !== null) return (path.getAttribute('d') ?? '').match(/[ML]/g)?.length ?? 0;
    }

    return 0;
  });
}

export async function isPathDrawingActive(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const store = window.__broadsetProjectEditorStore;

    return (store?.getState().pathDrawingElementId ?? null) !== null;
  });
}

export async function clickAbsolute(page: Page, x: number, y: number): Promise<void> {
  await clickCanvasPoint(page, x, y);
}

export async function clickAndWaitForVertex(
  page: Page,
  x: number,
  y: number,
  expectedVertexCount: number,
): Promise<void> {
  await clickAbsolute(page, x, y);

  await expect
    .poll(
      async () => {
        const [vertexCount, drawingActive, widgetCount] = await Promise.all([
          getLatestPathVertexCount(page),
          isPathDrawingActive(page),
          page.getByTestId('demo-transform-widget').count(),
        ]);

        return {
          ready:
            vertexCount >= expectedVertexCount &&
            (expectedVertexCount === 1 ? drawingActive && widgetCount === 0 : true),
          vertexCount,
        };
      },
      { timeout: 4_000 },
    )
    .toMatchObject({ ready: true });
}
