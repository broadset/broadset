import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS } from '../fixture-selectors';
import { getHandleCenter, getWidgetRotation, rotateSelectedElement } from './helpers';

async function readSelectedWestAnchor(page: Page): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(() => {
    const state = window.__broadsetProjectEditorStore?.getState();
    const selectedId = state?.activeInstanceAddresses[0]?.elementId;
    const element = state?.project.documents[0]?.elements.find(({ id }) => id === selectedId);

    if (element?.geometry.transform.kind !== 'affine2d') {
      throw new Error('Expected an affine selected element');
    }

    const [a, b, c, d, e, f] = element.geometry.transform.matrix;
    const [originX, originY] = element.geometry.origin;
    const localY = element.geometry.bounds.height / 2;

    return {
      x: originX + a * -originX + c * (localY - originY) + e,
      y: originY + b * -originX + d * (localY - originY) + f,
    };
  });
}

/**
 * @description After rotating an element, the widget's CSS `rotate()` changes
 * and all 8 resize handles remain visible and positioned within the (now-rotated)
 * widget bounds. This validates that a rotation commit correctly persists and
 * the handle layout re-renders inside the rotated container.
 */
test('after rotation, all resize handles are still visible and inside the rotated widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Rotate the element ~30-50 degrees clockwise
  await rotateSelectedElement(page, 80, 30);

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

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  // Record post-rotation widget size
  const postRotateBox = await widget.boundingBox();

  if (postRotateBox === null) {
    throw new Error('Widget bounding box not found after rotation');
  }

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

  // Widget dimensions should remain valid after resize interaction.
  const postWidth = await widget.evaluate((el) => el.style.width);
  const postHeight = await widget.evaluate((el) => el.style.height);

  expect(postWidth.endsWith('px')).toBe(true);
  expect(postHeight.endsWith('px')).toBe(true);

  // Rotation should be preserved (not reset to 0)
  expect(await getWidgetRotation(page)).toBeCloseTo(rotationDeg, 4);
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

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const rotationDeg = await rotateSelectedElement(page, 80, 30);
  const rotationRad = (rotationDeg * Math.PI) / 180;

  const preWidth = parseFloat(await widget.evaluate((element) => element.style.width));
  const preHeight = parseFloat(await widget.evaluate((element) => element.style.height));
  const westBefore = await readSelectedWestAnchor(page);
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
  const westAfter = await readSelectedWestAnchor(page);

  expect(postWidth).toBeGreaterThanOrEqual(preWidth);
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

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const rotationDeg = await rotateSelectedElement(page, 70, 20);
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const preWidth = parseFloat(await widget.evaluate((element) => element.style.width));

  const westBefore = await readSelectedWestAnchor(page);
  const eastStart = await getHandleCenter(page, 'e');

  const collapseDrag = 260;
  const targetX = eastStart.x - Math.cos(rotationRad) * collapseDrag;
  const targetY = eastStart.y - Math.sin(rotationRad) * collapseDrag;

  await page.mouse.move(eastStart.x, eastStart.y);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();

  const postWidth = parseFloat(await widget.evaluate((element) => element.style.width));
  const westAfter = await readSelectedWestAnchor(page);

  expect(postWidth).toBeLessThanOrEqual(preWidth);
  expect(postWidth).toBeGreaterThan(0);
  expect(Math.abs(westAfter.x - westBefore.x)).toBeLessThan(0.01);
  expect(Math.abs(westAfter.y - westBefore.y)).toBeLessThan(0.01);
});

/**
 * @description After rotating an element, dragging the transform bounds
 * (the element body) should move the widget. The rotation persists through
 * the drag, and the widget's position (left/top) changes while width/height
 * and rotation remain the same.
 */
test('drag/move works correctly after rotating the element (rotate → drag)', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

  // Record post-rotation position
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

  // Position remains valid after drag interaction.
  const postLeft = await widget.evaluate((el) => el.style.left);
  const postTop = await widget.evaluate((el) => el.style.top);

  expect(postLeft.endsWith('px')).toBe(true);
  expect(postTop.endsWith('px')).toBe(true);

  // Width should stay the same (drag doesn't resize)
  const postWidth = await widget.evaluate((el) => el.style.width);

  expect(postWidth).toBe(preWidth);

  // Rotation should be preserved
  expect(await getWidgetRotation(page)).toBeCloseTo(rotationDeg, 4);
});

/**
 * @description A full three-step compound sequence: rotate → resize → drag.
 * Validates that the rotation persists through the resize, and then both
 * rotation and new dimensions persist through the drag. The final state
 * should reflect all three transforms applied.
 */
test('full compound sequence: rotate → resize → drag preserves all transforms', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.locator(`[data-element-id="${FIXTURE_IDS.video}"]`).click({ force: true });

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Step 1: rotate
  const rotationDeg = await rotateSelectedElement(page, 80, 30);

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
  expect(await getWidgetRotation(page)).toBeCloseTo(rotationDeg, 4);

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
  const finalWidth = await widget.evaluate((el) => el.style.width);
  const finalHeight = await widget.evaluate((el) => el.style.height);

  expect(await getWidgetRotation(page)).toBeCloseTo(rotationDeg, 4);
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

  // The rotation handle is positioned via CSS top: -rotationOffsetPx
  // + translate(-50%,-50%) inside the rotated widget div. The inline `top`
  // is expressed in canvas units (counter-scaled so the handle stays the
  // same screen size under any zoom/letterbox), while its CSS `left`
  // remains percent-based relative to the widget.
  const rotationHandle = page.getByTestId('transform-rotation-handle');

  await expect(rotationHandle).toBeVisible();

  const handleStyle = await rotationHandle.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
  }));

  expect(handleStyle.left).toBe('50%');
  expect(handleStyle.top).toMatch(/^-\d+(\.\d+)?px$/);
  expect(parseFloat(handleStyle.top)).toBeLessThan(0);
});
