import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../src/DemoApp';

async function getHandleCenter(page: Page, handle: 'e' | 'w' | 'n' | 's'): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(`transform-handle-${handle}`).boundingBox();

  if (box === null) {
    throw new Error(`Handle ${handle} bounding box not found`);
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

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
/*  Direct canvas click selection                                      */
/* ------------------------------------------------------------------ */

/**
 * @description Validates `project/spec/editor/canvas.md` C-02 behavior:
 * clicking empty canvas space clears selection, hides the transform widget,
 * and disables selection-dependent sidebar tabs.
 */
test('clicking empty canvas space clears selection and disables dependent sidebar tabs', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const preview = page.getByLabel(/screen preview for/i);

  // The sample document includes a full-stage background hit target, so a
  // pointer click usually lands on an element. Dispatching a click on the
  // preview root exercises the explicit "clear selection" branch.
  await preview.dispatchEvent('click');

  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);
  await expect(page.locator('button[aria-label="Properties"]').first()).toBeDisabled();
  await expect(page.locator('button[aria-label="Animation"]').first()).toBeDisabled();
});

/**
 * @description Validates `project/spec/editor/editing.md` C-08 behavior:
 * click-only placement uses default element dimensions and selects the newly
 * placed element so transform controls attach immediately.
 */
test('click-only placement creates a default-size rectangle and selects it', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const idsBefore = await page
    .locator('[data-element-id]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.getAttribute('data-element-id')).filter((id) => id !== null)),
    ]);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  const clickOffsetX = previewBox.width * 0.28;
  const clickOffsetY = previewBox.height * 0.78;

  await preview.click({ position: { x: clickOffsetX, y: clickOffsetY } });

  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();

  const idsAfter = await page
    .locator('[data-element-id]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.getAttribute('data-element-id')).filter((id) => id !== null)),
    ]);
  const newElementId = idsAfter.find((id) => !idsBefore.includes(id));

  if (newElementId === undefined) {
    throw new Error('No new element ID found after click-only placement');
  }

  const newElement = page.locator(`[data-element-id="${newElementId}"]`);
  const newBox = await newElement.boundingBox();
  const widgetBox = await page.getByTestId('demo-transform-widget').boundingBox();

  if (newBox === null || widgetBox === null) {
    throw new Error('Placed element or transform widget bounding box not found');
  }

  expect(widgetBox.x).toBeCloseTo(newBox.x, -1);
  expect(widgetBox.y).toBeCloseTo(newBox.y, -1);
  expect(widgetBox.width).toBeCloseTo(newBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(newBox.height, -1);

  // Default rectangle size is 80x50 in document space.
  const ribbonBox = await page.locator('[data-element-id="el-top-ribbon"]').boundingBox();

  if (ribbonBox === null) {
    throw new Error('Reference ribbon bounding box not found');
  }

  const contentScale = ribbonBox.width / 920;

  expect(Math.abs(newBox.width - 80 * contentScale)).toBeLessThan(4);
  expect(Math.abs(newBox.height - 50 * contentScale)).toBeLessThan(4);

  // Placement selects the new element immediately.
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates that clicking a canvas element directly (not via
 * the layers panel) selects it and repositions the transform widget to
 * visually overlay that element's bounds. Uses el-sponsor-logo which is
 * isolated in the bottom-right and not obscured by any other element.
 */
test('clicking a canvas element directly selects it and shows the widget at its bounds', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Verify initial auto-selection is el-top-ribbon — widget overlays rendered element
  await expect(widget).toBeVisible();

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

  // Click el-sponsor-logo which is isolated in the bottom-right (far from widget)
  const sponsorLogo = page.locator('[data-element-id="el-sponsor-logo"]');

  await expect(sponsorLogo).toBeVisible();
  await sponsorLogo.click();

  // Widget should reposition to visually overlay el-sponsor-logo
  const logoBox = await sponsorLogo.boundingBox();
  const newWidgetBox = await widget.boundingBox();

  if (logoBox === null || newWidgetBox === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(newWidgetBox.x).toBeCloseTo(logoBox.x, -1);
  expect(newWidgetBox.y).toBeCloseTo(logoBox.y, -1);
  expect(newWidgetBox.width).toBeCloseTo(logoBox.width, -1);
  expect(newWidgetBox.height).toBeCloseTo(logoBox.height, -1);
});

/**
 * @description Validates that clicking a second canvas element outside the
 * first widget area switches selection. After selecting el-sponsor-logo,
 * clicking el-hero-badge (isolated on the right) should reposition the widget.
 */
test('clicking another canvas element switches the selection and widget position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-sponsor-logo first (isolated bottom-right, outside ribbon widget)
  const sponsorLogo = page.locator('[data-element-id="el-sponsor-logo"]');

  await sponsorLogo.click();

  const logoBox = await sponsorLogo.boundingBox();
  const widgetAfterLogo = await widget.boundingBox();

  if (logoBox === null || widgetAfterLogo === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(widgetAfterLogo.x).toBeCloseTo(logoBox.x, -1);
  expect(widgetAfterLogo.y).toBeCloseTo(logoBox.y, -1);

  // Now click el-hero-badge (isolated on the right, outside sponsor-logo widget)
  const heroBadge = page.locator('[data-element-id="el-hero-badge"]');

  await expect(heroBadge).toBeVisible();
  await heroBadge.click();

  const badgeBox = await heroBadge.boundingBox();
  const widgetAfterBadge = await widget.boundingBox();

  if (badgeBox === null || widgetAfterBadge === null) {
    throw new Error('Widget bounding box not found after badge click');
  }

  // Widget should overlay el-hero-badge
  expect(widgetAfterBadge.x).toBeCloseTo(badgeBox.x, -1);
  expect(widgetAfterBadge.y).toBeCloseTo(badgeBox.y, -1);
  expect(widgetAfterBadge.width).toBeCloseTo(badgeBox.width, -1);
  expect(widgetAfterBadge.height).toBeCloseTo(badgeBox.height, -1);
});

/* ------------------------------------------------------------------ */
/*  Handle position verification                                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that all 8 resize handles are positioned at the
 * correct locations relative to the widget bounds. Handles are 10×10 px
 * circles positioned at corners and edge midpoints within the widget.
 */
test('resize handles are positioned at correct locations relative to the widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const widgetBox = await widget.boundingBox();

  if (widgetBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const tolerance = 3;
  // Handles are positioned with CSS left/right/top/bottom: -5px and
  // transform: translate(±50%, ±50%), placing their centers 5px outside
  // the widget edge (half the 10px handle size).
  const offset = 5;

  const checkHandle = async (handle: string, expectedCenterX: number, expectedCenterY: number): Promise<void> => {
    const handleEl = page.getByTestId(`transform-handle-${handle}`);
    const handleBox = await handleEl.boundingBox();

    if (handleBox === null) {
      throw new Error(`Handle ${handle} bounding box not found`);
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const handleCenterY = handleBox.y + handleBox.height / 2;

    expect(handleCenterX).toBeCloseTo(expectedCenterX, -Math.log10(tolerance));
    expect(handleCenterY).toBeCloseTo(expectedCenterY, -Math.log10(tolerance));
  };

  // Corner handles: center offset 5px outside widget corner
  // Edge handles: center on edge midpoint, offset 5px outward
  await checkHandle('nw', widgetBox.x - offset, widgetBox.y - offset);
  await checkHandle('n', widgetBox.x + widgetBox.width / 2, widgetBox.y - offset);
  await checkHandle('ne', widgetBox.x + widgetBox.width + offset, widgetBox.y - offset);
  await checkHandle('e', widgetBox.x + widgetBox.width + offset, widgetBox.y + widgetBox.height / 2);
  await checkHandle('se', widgetBox.x + widgetBox.width + offset, widgetBox.y + widgetBox.height + offset);
  await checkHandle('s', widgetBox.x + widgetBox.width / 2, widgetBox.y + widgetBox.height + offset);
  await checkHandle('sw', widgetBox.x - offset, widgetBox.y + widgetBox.height + offset);
  await checkHandle('w', widgetBox.x - offset, widgetBox.y + widgetBox.height / 2);
});

/**
 * @description Validates that the rotation handle is positioned above the
 * widget's top-center by the ROTATION_HANDLE_OFFSET (28px) distance.
 */
test('rotation handle is positioned above the widget top-center', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const widgetBox = await widget.boundingBox();
  const rotationHandle = page.getByTestId('transform-rotation-handle');
  const rotationBox = await rotationHandle.boundingBox();

  if (widgetBox === null || rotationBox === null) {
    throw new Error('Widget or rotation handle bounding box not found');
  }

  const rotationCenterX = rotationBox.x + rotationBox.width / 2;
  const rotationCenterY = rotationBox.y + rotationBox.height / 2;
  const widgetTopCenterX = widgetBox.x + widgetBox.width / 2;

  expect(rotationCenterX).toBeCloseTo(widgetTopCenterX, 0);
  // Rotation handle center is 28px above widget top edge
  expect(rotationCenterY).toBeCloseTo(widgetBox.y - 28, 0);
});

/**
 * @description Validates that handle positions update correctly when selecting
 * a different, smaller element. After selecting el-hero-badge (96×96 doc-space),
 * the widget and handle positions should match the smaller element's bounds.
 */
test('handles reposition correctly for a small element selected via canvas click', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-sponsor-logo (isolated bottom-right, not obscured)
  const sponsorLogo = page.locator('[data-element-id="el-sponsor-logo"]');

  await sponsorLogo.click();

  const widgetBox = await widget.boundingBox();
  const logoBox = await sponsorLogo.boundingBox();

  if (widgetBox === null || logoBox === null) {
    throw new Error('Widget or logo bounding box not found');
  }

  // Widget dimensions should match the rendered logo element
  expect(widgetBox.width).toBeCloseTo(logoBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(logoBox.height, -1);

  // East handle at right edge, west handle at left edge
  const eastHandle = page.getByTestId('transform-handle-e');
  const westHandle = page.getByTestId('transform-handle-w');
  const eastBox = await eastHandle.boundingBox();
  const westBox = await westHandle.boundingBox();

  if (eastBox === null || westBox === null) {
    throw new Error('Handle bounding box not found');
  }

  const eastCenterX = eastBox.x + eastBox.width / 2;
  const westCenterX = westBox.x + westBox.width / 2;

  // East handle center is 5px outside widget right edge (CSS translate offset)
  expect(eastCenterX).toBeCloseTo(widgetBox.x + widgetBox.width + 5, 1);
  // West handle center is 5px outside widget left edge
  expect(westCenterX).toBeCloseTo(widgetBox.x - 5, 1);
  // Distance between east and west handle centers should equal widget width + 10
  expect(eastCenterX - westCenterX).toBeCloseTo(widgetBox.width + 10, 0);
});

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

  // Rotation should no longer be 0deg
  const newTransform = await widget.evaluate((el) => el.style.transform);

  expect(newTransform).not.toBe('rotate(0deg)');
  expect(newTransform).toMatch(/^rotate\([\d.-]+deg\)$/);
});

/* ------------------------------------------------------------------ */
/*  Compound transform sequences (rotate → resize / drag)             */
/* ------------------------------------------------------------------ */

/**
 * Helper: rotates the currently-selected element via the rotation handle.
 * Returns the resulting rotation in degrees parsed from the widget style.
 */
async function rotateSelectedElement(page: Page, deltaX: number, deltaY: number): Promise<number> {
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
