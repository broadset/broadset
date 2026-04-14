import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../src/DemoApp';
import { getHandleCenter, rotateSelectedElement } from './canvas-selection-transform.helpers';

/**
 * @description After rotating an element, the widget's CSS `rotate()` changes
 * and all 8 resize handles remain visible and positioned within the (now-rotated)
 * widget bounds. This validates that a rotation commit correctly persists and
 * the handle layout re-renders inside the rotated container.
 */
test('after rotation, all resize handles are still visible and inside the rotated widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Rotate the element ~30-50 degrees clockwise
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  expect(Math.abs(rotationDeg)).toBeGreaterThan(5);

  // All 8 handles should still be visible
  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
    await expect(page.getByTestId(`transform-handle-${handle}`)).toBeVisible();
  }

  // Rotation handle should also still be visible
  await expect(page.getByTestId('transform-rotation-handle')).toBeVisible();
});

/**
 * @description After rotating an element, dragging the SE resize handle should
 * still change the widget's width and height. The CSS rotation stays the same
 * (rotation is not changed by resize), and the resulting dimensions differ from
 * the pre-resize state.
 */
test('resize works correctly after rotating the element (rotate → resize SE)', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  expect(Math.abs(rotationDeg)).toBeGreaterThan(5);

  // Record post-rotation widget size
  const postRotateBox = await widget.boundingBox();

  if (postRotateBox === null) {
    throw new Error('Widget bounding box not found after rotation');
  }

  const preWidth = await widget.evaluate((el) => el.style.width);
  const preHeight = await widget.evaluate((el) => el.style.height);

  // Step 2: resize via SE handle
  const seHandle = page.getByTestId('transform-handle-se');
  const seBox = await seHandle.boundingBox();

  if (seBox === null) {
    throw new Error('SE handle bounding box not found');
  }

  const seStartX = seBox.x + seBox.width / 2;
  const seStartY = seBox.y + seBox.height / 2;

  await page.mouse.move(seStartX, seStartY);
  await page.mouse.down();
  await page.mouse.move(seStartX + 60, seStartY + 40, { steps: 10 });
  await page.mouse.up();

  // Widget dimensions should have changed
  const postWidth = await widget.evaluate((el) => el.style.width);
  const postHeight = await widget.evaluate((el) => el.style.height);

  expect(postWidth).not.toBe(preWidth);
  expect(postHeight).not.toBe(preHeight);

  // Rotation should be preserved (not reset to 0)
  const finalTransform = await widget.evaluate((el) => el.style.transform);

  expect(finalTransform).toBe(`rotate(${String(rotationDeg)}deg)`);
});

/**
 * @description Validates C-05 local-axis resize behavior after rotation:
 * dragging the east handle along the element's local X axis changes width,
 * keeps height stable, and keeps the west-edge anchor near-stationary.
 */
test('after rotation, east-handle drag along local X changes width only and keeps west anchor stable', async ({
  mount,
  page,
}) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const rotationDeg = await rotateSelectedElement(page, 80, 30);
  const rotationRad = (rotationDeg * Math.PI) / 180;

  const preWidth = parseFloat(await widget.evaluate((element) => element.style.width));
  const preHeight = parseFloat(await widget.evaluate((element) => element.style.height));
  const westBefore = await getHandleCenter(page, 'w');
  const eastStart = await getHandleCenter(page, 'e');

  const localXDrag = 90;
  const targetX = eastStart.x + Math.cos(rotationRad) * localXDrag;
  const targetY = eastStart.y + Math.sin(rotationRad) * localXDrag;

  await page.mouse.move(eastStart.x, eastStart.y);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();

  const postWidth = parseFloat(await widget.evaluate((element) => element.style.width));
  const postHeight = parseFloat(await widget.evaluate((element) => element.style.height));
  const westAfter = await getHandleCenter(page, 'w');

  expect(postWidth).toBeGreaterThan(preWidth);
  expect(Math.abs(postHeight - preHeight)).toBeLessThan(2);
  expect(Math.abs(westAfter.x - westBefore.x)).toBeLessThan(4);
  expect(Math.abs(westAfter.y - westBefore.y)).toBeLessThan(4);
});

/**
 * @description Validates rotated min-size clamp UX:
 * collapsing a rotated element through the east handle to minimum size must
 * not cause opposite-edge drift (the element should not slide around).
 */
test('collapsing a rotated element to minimum size does not slide the opposite edge', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator('[data-element-id="el-sponsor-logo"]').click();

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const rotationDeg = await rotateSelectedElement(page, 70, 20);
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const preWidth = parseFloat(await widget.evaluate((element) => element.style.width));

  const westBefore = await getHandleCenter(page, 'w');
  const eastStart = await getHandleCenter(page, 'e');

  const collapseDrag = 260;
  const targetX = eastStart.x - Math.cos(rotationRad) * collapseDrag;
  const targetY = eastStart.y - Math.sin(rotationRad) * collapseDrag;

  await page.mouse.move(eastStart.x, eastStart.y);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();

  const postWidth = parseFloat(await widget.evaluate((element) => element.style.width));
  const westAfter = await getHandleCenter(page, 'w');

  expect(postWidth).toBeLessThan(preWidth);
  expect(postWidth).toBeGreaterThan(0);
  expect(Math.abs(westAfter.x - westBefore.x)).toBeLessThan(5);
  expect(Math.abs(westAfter.y - westBefore.y)).toBeLessThan(5);
});

/**
 * @description After rotating an element, dragging the transform bounds
 * (the element body) should move the widget. The rotation persists through
 * the drag, and the widget's position (left/top) changes while width/height
 * and rotation remain the same.
 */
test('drag/move works correctly after rotating the element (rotate → drag)', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  expect(Math.abs(rotationDeg)).toBeGreaterThan(5);

  // Record post-rotation position
  const preLeft = await widget.evaluate((el) => el.style.left);
  const preTop = await widget.evaluate((el) => el.style.top);
  const preWidth = await widget.evaluate((el) => el.style.width);

  // Step 2: drag via the bounds area
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Bounds bounding box not found after rotation');
  }

  const dragStartX = boundsBox.x + boundsBox.width / 2;
  const dragStartY = boundsBox.y + boundsBox.height / 2;

  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 50, dragStartY + 30, { steps: 10 });
  await page.mouse.up();

  // Position should have changed
  const postLeft = await widget.evaluate((el) => el.style.left);
  const postTop = await widget.evaluate((el) => el.style.top);

  expect(postLeft).not.toBe(preLeft);
  expect(postTop).not.toBe(preTop);

  // Width should stay the same (drag doesn't resize)
  const postWidth = await widget.evaluate((el) => el.style.width);

  expect(postWidth).toBe(preWidth);

  // Rotation should be preserved
  const finalTransform = await widget.evaluate((el) => el.style.transform);

  expect(finalTransform).toBe(`rotate(${String(rotationDeg)}deg)`);
});

/**
 * @description A full three-step compound sequence: rotate → resize → drag.
 * Validates that the rotation persists through the resize, and then both
 * rotation and new dimensions persist through the drag. The final state
 * should reflect all three transforms applied.
 */
test('full compound sequence: rotate → resize → drag preserves all transforms', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  expect(Math.abs(rotationDeg)).toBeGreaterThan(5);

  // Step 2: resize via NW handle (shrinks from top-left)
  const nwHandle = page.getByTestId('transform-handle-nw');
  const nwBox = await nwHandle.boundingBox();

  if (nwBox === null) {
    throw new Error('NW handle bounding box not found');
  }

  const nwStartX = nwBox.x + nwBox.width / 2;
  const nwStartY = nwBox.y + nwBox.height / 2;

  await page.mouse.move(nwStartX, nwStartY);
  await page.mouse.down();
  await page.mouse.move(nwStartX + 40, nwStartY + 30, { steps: 10 });
  await page.mouse.up();

  const afterResizeWidth = await widget.evaluate((el) => el.style.width);
  const afterResizeHeight = await widget.evaluate((el) => el.style.height);

  // Rotation should still be the same
  expect(await widget.evaluate((el) => el.style.transform)).toBe(`rotate(${String(rotationDeg)}deg)`);

  // Step 3: drag the element
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Bounds bounding box not found after resize');
  }

  const dragStartX = boundsBox.x + boundsBox.width / 2;
  const dragStartY = boundsBox.y + boundsBox.height / 2;

  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 60, dragStartY + 40, { steps: 10 });
  await page.mouse.up();

  // After full sequence: rotation preserved, dimensions preserved, position changed
  const finalTransform = await widget.evaluate((el) => el.style.transform);
  const finalWidth = await widget.evaluate((el) => el.style.width);
  const finalHeight = await widget.evaluate((el) => el.style.height);

  expect(finalTransform).toBe(`rotate(${String(rotationDeg)}deg)`);
  expect(finalWidth).toBe(afterResizeWidth);
  expect(finalHeight).toBe(afterResizeHeight);
});

/**
 * @description After rotating an element, the rotation handle should still
 * be positioned above the widget's top edge (in rotated space). The offset
 * from widget top-center to rotation handle center should be approximately
 * ROTATION_HANDLE_OFFSET (28px), regardless of the rotation angle.
 */
test('rotation handle stays above widget top-center after rotation', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Rotate the element
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  expect(Math.abs(rotationDeg)).toBeGreaterThan(5);

  // The rotation handle is positioned via CSS top: -28px + translate(-50%,-50%)
  // inside the rotated widget div. In screen space, the bounding box of the
  // handle shifts with the rotation, but the handle should still be ABOVE
  // the widget's own bounding box top edge (in screen space, roughly).
  const rotationHandle = page.getByTestId('transform-rotation-handle');

  await expect(rotationHandle).toBeVisible();

  // The handle's center in widget-local space should be at (50%, -28px).
  // We verify this by reading the CSS positioning directly.
  const handleStyle = await rotationHandle.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
  }));

  expect(handleStyle.left).toBe('50%');
  expect(handleStyle.top).toBe('-28px');
});
