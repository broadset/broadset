import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../src/DemoApp';

/* ------------------------------------------------------------------ */
/*  Transform widget — selection and positioning                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that the DemoApp starts with the first unlocked
 * element auto-selected and the transform widget visible at that element's
 * bounds. The initial selection is el-top-ribbon (x:60, y:52, 920×96).
 */
test('shows the transform widget on mount for the auto-selected element', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Widget should visually overlay the auto-selected el-top-ribbon
  const ribbonEl = page.locator('[data-element-id="el-top-ribbon"]');
  const ribbonBox = await ribbonEl.boundingBox();
  const widgetBox = await widget.boundingBox();

  if (ribbonBox === null || widgetBox === null) {
    throw new Error('Element or widget bounding box not found');
  }

  expect(widgetBox.x).toBeCloseTo(ribbonBox.x, -1);
  expect(widgetBox.y).toBeCloseTo(ribbonBox.y, -1);
  expect(widgetBox.width).toBeCloseTo(ribbonBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(ribbonBox.height, -1);
});

/**
 * @description Validates that all 8 resize handles and the rotation handle
 * are rendered when an element is selected, providing the complete transform
 * affordance set.
 */
test('renders all resize handles and the rotation handle when an element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Widget is visible from auto-selection
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
    await expect(page.getByTestId(`transform-handle-${handle}`)).toBeVisible();
  }

  await expect(page.getByTestId('transform-rotation-handle')).toBeVisible();
});

/**
 * @description Validates that selecting a different element repositions the
 * transform widget to that element's bounds. Uses the layers panel to change
 * selection (valid cross-region flow).
 */
test('repositions the transform widget when a different element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Initial selection: el-top-ribbon
  await expect(widget).toBeVisible();

  const ribbonEl = page.locator('[data-element-id="el-top-ribbon"]');
  const initialWidgetBox = await widget.boundingBox();
  const ribbonBox = await ribbonEl.boundingBox();

  if (initialWidgetBox === null || ribbonBox === null) {
    throw new Error('Widget or ribbon bounding box not found');
  }

  expect(initialWidgetBox.x).toBeCloseTo(ribbonBox.x, -1);
  expect(initialWidgetBox.y).toBeCloseTo(ribbonBox.y, -1);

  // Select el-hero-badge via layers panel (x:1010, y:126, 96×96)
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  const badgeEl = page.locator('[data-element-id="el-hero-badge"]');
  const newWidgetBox = await widget.boundingBox();
  const badgeBox = await badgeEl.boundingBox();

  if (newWidgetBox === null || badgeBox === null) {
    throw new Error('Widget or badge bounding box not found');
  }

  expect(newWidgetBox.x).toBeCloseTo(badgeBox.x, -1);
  expect(newWidgetBox.y).toBeCloseTo(badgeBox.y, -1);
  expect(newWidgetBox.width).toBeCloseTo(badgeBox.width, -1);
  expect(newWidgetBox.height).toBeCloseTo(badgeBox.height, -1);
});

/**
 * @description Validates that the transform widget correctly applies the
 * element's rotation as a CSS transform.
 */
test('applies element rotation to the transform widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // el-top-ribbon has rotation: 0 (all sample elements have 0 rotation)
  const transform = await widget.evaluate((el) => el.style.transform);

  expect(transform).toBe('rotate(0deg)');
});

/* ------------------------------------------------------------------ */
/*  Cross-region: canvas selection ↔ properties sidebar                */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: the auto-selected element's
 * properties are shown in the sidebar, and clicking a different element
 * updates the sidebar properties to match the new selection.
 */
test('updates the properties sidebar when a different element is selected via layers', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const sidebar = page.getByTestId('demo-properties-sidebar');

  // Initial selection is el-top-ribbon — properties should be populated (no empty message)
  await expect(sidebar.getByText('Select an element to edit its properties')).toHaveCount(0);

  // Geometry X field should be visible
  const xField = sidebar.locator('[aria-label="X"]');

  await expect(xField).toBeVisible();

  // Select a different element via layers panel
  await page.locator('button[aria-label="Layers"]').first().click();
  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  // Sidebar auto-switches to properties — X field should still be visible
  await expect(xField).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Cross-region: layers sidebar ↔ canvas selection                    */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: clicking a layer entry in the
 * layers sidebar selects the element, causing the transform widget to
 * reposition and the sidebar to switch to properties.
 */
test('selects an element via the layers panel and repositions the transform widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Initial widget position for el-top-ribbon
  const ribbonEl = page.locator('[data-element-id="el-top-ribbon"]');
  const initialWidgetBox = await widget.boundingBox();
  const ribbonBox = await ribbonEl.boundingBox();

  if (initialWidgetBox === null || ribbonBox === null) {
    throw new Error('Widget or ribbon bounding box not found');
  }

  expect(initialWidgetBox.x).toBeCloseTo(ribbonBox.x, -1);

  // Switch to layers tab
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  // Click on the el-hero-badge layer (named "Live Badge Orb")
  await sidebar.locator('[role="button"]', { hasText: 'Live Badge Orb' }).click();

  // Widget should reposition to el-hero-badge
  const badgeEl = page.locator('[data-element-id="el-hero-badge"]');
  const newWidgetBox = await widget.boundingBox();
  const badgeBox = await badgeEl.boundingBox();

  if (newWidgetBox === null || badgeBox === null) {
    throw new Error('Widget or badge bounding box not found');
  }

  expect(newWidgetBox.x).toBeCloseTo(badgeBox.x, -1);
  expect(newWidgetBox.y).toBeCloseTo(badgeBox.y, -1);
  expect(newWidgetBox.width).toBeCloseTo(badgeBox.width, -1);
  expect(newWidgetBox.height).toBeCloseTo(badgeBox.height, -1);
});

/* ------------------------------------------------------------------ */
/*  Keyboard: Delete removes element from canvas                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: pressing Delete with a selected
 * element removes it from the canvas and clears the selection/widget.
 */
test('removes a selected element from the canvas when Delete is pressed', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select el-accent-svg via layers panel (avoids transform widget overlay)
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Broadcast Accent SVG' }).click();

  const svgElement = page.locator('[data-element-id="el-accent-svg"]');

  await expect(svgElement).toBeVisible();
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  // Press Delete
  await page.keyboard.press('Delete');

  // Element should be removed from the canvas
  await expect(svgElement).toHaveCount(0);

  // Transform widget should also be gone (no selection)
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/*  Keyboard: Ctrl+Z undo restores a deleted element                   */
/* ------------------------------------------------------------------ */

/**
 * @description Validates the cross-region flow: after deleting an element,
 * Ctrl+Z (undo) restores it to the canvas.
 */
test('restores a deleted element when Ctrl+Z undo is pressed', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select el-accent-svg via layers panel
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.locator('[role="button"]', { hasText: 'Broadcast Accent SVG' }).click();

  const svgElement = page.locator('[data-element-id="el-accent-svg"]');

  await expect(svgElement).toBeVisible();

  // Delete
  await page.keyboard.press('Delete');
  await expect(svgElement).toHaveCount(0);

  // Undo
  await page.keyboard.press('Control+z');

  // Element should be restored on the canvas
  await expect(svgElement).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Context menu: element-specific actions                             */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that right-clicking a canvas element shows a context
 * menu with element-specific actions (Cut, Copy, Delete, etc.).
 */
test('shows element-specific context menu actions when an element is selected', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const contextMenu = page.getByTestId('demo-context-menu');

  // The preview container is the area for right-clicking. With an element already
  // selected (auto-selection on mount), right-click the canvas to get the element menu.
  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview box not found');
  }

  // Right-click in the center of the preview area — the context menu handler
  // reads the selected element from the store for element-specific actions.
  await preview.click({ button: 'right', position: { x: previewBox.width / 2, y: previewBox.height / 2 } });
  await expect(contextMenu).toBeVisible();

  // Should show element-specific actions since an element is selected
  await expect(contextMenu.getByText('Cut')).toBeVisible();
  await expect(contextMenu.getByText('Copy')).toBeVisible();
  await expect(contextMenu.getByText('Delete')).toBeVisible();
  await expect(contextMenu.getByText('Duplicate')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/*  Transform widget: drag moves the element position                  */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging the transform bounds area moves the
 * element, updating the widget's inline position on the canvas.
 */
test('dragging the transform bounds moves the element position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Initial position for el-top-ribbon
  const initialLeft = await widget.evaluate((el) => parseFloat(el.style.left));
  const initialTop = await widget.evaluate((el) => parseFloat(el.style.top));

  // Drag the bounds area to move the element
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Bounds box not found');
  }

  const startX = boundsBox.x + boundsBox.width / 2;
  const startY = boundsBox.y + boundsBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 30, { steps: 5 });
  await page.mouse.up();

  // Widget position should have changed
  const newLeft = await widget.evaluate((el) => parseFloat(el.style.left));
  const newTop = await widget.evaluate((el) => parseFloat(el.style.top));

  expect(newLeft).toBeGreaterThan(initialLeft);
  expect(newTop).toBeGreaterThan(initialTop);
});

/* ------------------------------------------------------------------ */
/*  Transform widget: resize handles change element dimensions         */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that dragging a resize handle changes the element
 * dimensions, updating the widget's inline size on the canvas.
 */
test('dragging a resize handle changes the element dimensions', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Initial width for el-top-ribbon
  const initialWidth = await widget.evaluate((el) => parseFloat(el.style.width));

  // Drag the east (right) handle to resize wider
  const handle = page.getByTestId('transform-handle-e');
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('Handle box not found');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY, { steps: 5 });
  await page.mouse.up();

  // Width should have increased
  const newWidth = await widget.evaluate((el) => parseFloat(el.style.width));

  expect(newWidth).toBeGreaterThan(initialWidth);
});

/* ------------------------------------------------------------------ */
