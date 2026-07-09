import { expect, type Page } from '@playwright/test';

export type CanvasRootRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export async function getCanvasRootRect(page: Page): Promise<CanvasRootRect> {
  const rect = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-broadset-canvas-root]');

    if (root === null) return null;

    const r = root.getBoundingClientRect();

    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

  if (rect === null) throw new Error('Canvas root rect not found');

  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(`Canvas root has zero dimensions: ${JSON.stringify(rect)}`);
  }

  const viewport = page.viewportSize() ?? { width: rect.x + rect.width, height: rect.y + rect.height };
  const clippedX = Math.max(rect.x, 0);
  const clippedY = Math.max(rect.y, 0);
  const clippedRight = Math.min(rect.x + rect.width, viewport.width);
  const clippedBottom = Math.min(rect.y + rect.height, viewport.height);
  const clipped = {
    x: clippedX,
    y: clippedY,
    width: clippedRight - clippedX,
    height: clippedBottom - clippedY,
  };

  if (clipped.width <= 0 || clipped.height <= 0) {
    throw new Error(`Canvas root clipped area is zero: ${JSON.stringify(clipped)}`);
  }

  return clipped;
}

export async function clickCanvasRatio(page: Page, xRatio: number, yRatio: number): Promise<void> {
  const rect = await getCanvasRootRect(page);

  await clickCanvasPoint(page, rect.x + rect.width * xRatio, rect.y + rect.height * yRatio);
}

export async function clickCanvasOffset(page: Page, offsetX: number, offsetY: number): Promise<void> {
  const rect = await getCanvasRootRect(page);

  await clickCanvasPoint(page, rect.x + offsetX, rect.y + offsetY);
}

export async function clickCanvasPoint(page: Page, x: number, y: number): Promise<void> {
  await page.getByLabel(/screen preview for/i).dispatchEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: x,
    clientY: y,
    detail: 1,
  });
}

export async function getPlacementType(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __broadsetEditorStore?: {
          getState: () => { readonly placement: { readonly type: string } | null };
        };
      }
    ).__broadsetEditorStore;

    return store?.getState().placement?.type ?? null;
  });
}

export async function waitForPlacementType(page: Page, expectedType: string | null): Promise<void> {
  await expect.poll(async () => getPlacementType(page)).toBe(expectedType);
}

export async function getHandleCenter(page: Page, handle: 'e' | 'w' | 'n' | 's'): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(`transform-handle-${handle}`).boundingBox();

  if (box === null) {
    throw new Error(`Handle ${handle} bounding box not found`);
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function rotateSelectedElement(page: Page, deltaX: number, deltaY: number): Promise<number> {
  const rotationHandle = page.getByTestId('transform-rotation-handle');
  const rotationBox = await rotationHandle.boundingBox();

  if (rotationBox === null) {
    throw new Error('Rotation handle bounding box not found');
  }

  const startX = rotationBox.x + rotationBox.width / 2;
  const startY = rotationBox.y + rotationBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
  await page.mouse.up();

  const transform = await page.getByTestId('demo-transform-widget').evaluate((el) => el.style.transform);
  const match = /^rotate\(([\d.-]+)deg\)$/.exec(transform);

  if (match?.[1] === undefined) {
    throw new Error(`Unexpected widget transform after rotation: ${transform}`);
  }

  return parseFloat(match[1]);
}
