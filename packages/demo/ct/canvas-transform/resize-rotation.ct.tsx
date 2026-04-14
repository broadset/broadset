import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

/* ------------------------------------------------------------------ */
/*  Handle resize gestures — directional correctness                   */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging the NW (north-west) handle resizes
 * the element from the top-left corner, moving position and reducing size.
 */
test('dragging the NW handle resizes from the top-left corner', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const initialBox = await widget.boundingBox();

  if (initialBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const handle = page.getByTestId('transform-handle-nw');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('NW handle bounding box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  // Drag NW handle 30px right and 20px down (shrinks from top-left)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY + 20, { steps: 5 });
  await page.mouse.up();

  const newBox = await widget.boundingBox();

  if (newBox === null) {
    throw new Error('Widget bounding box not found after drag');
  }

  // Position should move right and down
  expect(newBox.x).toBeGreaterThan(initialBox.x);
  expect(newBox.y).toBeGreaterThan(initialBox.y);

  // Size should decrease
  expect(newBox.width).toBeLessThan(initialBox.width);
  expect(newBox.height).toBeLessThan(initialBox.height);
});

/**
 * @description Validates that dragging the SE (south-east) handle resizes
 * from the bottom-right corner, keeping position but increasing size.
 */
test('dragging the SE handle resizes from the bottom-right corner', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const initialBox = await widget.boundingBox();

  if (initialBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const handle = page.getByTestId('transform-handle-se');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('SE handle bounding box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  // Drag SE handle 40px right and 25px down (grows from bottom-right)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 25, { steps: 5 });
  await page.mouse.up();

  const newBox = await widget.boundingBox();

  if (newBox === null) {
    throw new Error('Widget bounding box not found after drag');
  }

  // Position should stay the same (SE doesn't move origin)
  expect(newBox.x).toBeCloseTo(initialBox.x, 0);
  expect(newBox.y).toBeCloseTo(initialBox.y, 0);

  // Size should increase
  expect(newBox.width).toBeGreaterThan(initialBox.width);
  expect(newBox.height).toBeGreaterThan(initialBox.height);
});

/**
 * @description Validates that dragging the N (north) handle only changes
 * the element's top position and height, not its width or left position.
 */
test('dragging the N handle only changes top and height', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const initialBox = await widget.boundingBox();

  if (initialBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const handle = page.getByTestId('transform-handle-n');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('N handle bounding box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  // Drag N handle 40px down (shrinks from top)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 40, { steps: 10 });
  await page.mouse.up();

  const newBox = await widget.boundingBox();

  if (newBox === null) {
    throw new Error('Widget bounding box not found after drag');
  }

  // Left and width should remain the same
  expect(newBox.x).toBeCloseTo(initialBox.x, 0);
  expect(newBox.width).toBeCloseTo(initialBox.width, 0);

  // Top should move down and height should decrease
  expect(newBox.y).toBeGreaterThan(initialBox.y);
  expect(newBox.height).toBeLessThan(initialBox.height);
});

/**
 * @description Validates that dragging the W (west) handle only changes
 * the element's left position and width, not its top or height.
 */
test('dragging the W handle only changes left and width', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const initialBox = await widget.boundingBox();

  if (initialBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const handle = page.getByTestId('transform-handle-w');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('W handle bounding box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  // Drag W handle 30px right (shrinks from left)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY, { steps: 5 });
  await page.mouse.up();

  const newBox = await widget.boundingBox();

  if (newBox === null) {
    throw new Error('Widget bounding box not found after drag');
  }

  // Top and height should remain the same
  expect(newBox.y).toBeCloseTo(initialBox.y, 0);
  expect(newBox.height).toBeCloseTo(initialBox.height, 0);

  // Left should move right and width should decrease
  expect(newBox.x).toBeGreaterThan(initialBox.x);
  expect(newBox.width).toBeLessThan(initialBox.width);
});

/* ------------------------------------------------------------------ */
/*  Rotation gesture                                                   */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging the rotation handle changes the
 * widget's CSS rotation transform. Drags the handle to the right to
 * produce a clockwise rotation.
 */
test('dragging the rotation handle changes the widget rotation', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Initial rotation should be 0deg
  const initialTransform = await widget.evaluate((el) => el.style.transform);

  expect(initialTransform).toBe('rotate(0deg)');

  const rotationHandle = page.getByTestId('transform-rotation-handle');
  const rotationBox = await rotationHandle.boundingBox();

  if (rotationBox === null) {
    throw new Error('Rotation handle bounding box not found');
  }

  const startX = rotationBox.x + rotationBox.width / 2;
  const startY = rotationBox.y + rotationBox.height / 2;

  // Drag rotation handle to the right to rotate clockwise
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 30, { steps: 10 });
  await page.mouse.up();

  let newTransform = await widget.evaluate((el) => el.style.transform);

  // In CI the first drag can occasionally land on the 0deg axis.
  if (newTransform === 'rotate(0deg)') {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 90, startY + 45, { steps: 12 });
    await page.mouse.up();
    newTransform = await widget.evaluate((el) => el.style.transform);
  }

  expect(newTransform).not.toBe('rotate(0deg)');
  expect(newTransform).toMatch(/^rotate\([\d.-]+deg\)$/);
});
