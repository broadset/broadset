import type { Page } from '@playwright/test';

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
