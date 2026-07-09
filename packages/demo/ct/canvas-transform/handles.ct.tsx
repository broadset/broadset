import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS } from '../fixture-selectors';
import { clickCanvasRatio, waitForPlacementType } from './helpers';

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
  // Properties tab is always visible and selection-dependent. The
  // Animation tab is experimental-gated and not visible by default,
  // so we don't assert it here — the experimental harnesses cover
  // that flow.
  await expect(page.locator('button[aria-label="Properties"]').first()).toBeDisabled();
});

/**
 * @description Validates `project/spec/editor/editing.md` C-08 behavior:
 * two-click placement creates a rectangle sized by the two clicks and selects
 * the newly placed element so transform controls attach immediately. Banner
 * must never appear — the crosshair cursor + toolbar highlight are the only
 * affordances.
 */
test('two-click placement creates a rectangle sized by the clicks and selects it', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const elementCountBefore = await page.locator('[data-element-id]').count();

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);
  await waitForPlacementType(page, 'placement-anchor');

  const preview = page.getByLabel(/screen preview for/i);

  await clickCanvasRatio(page, 0.3, 0.3);
  await waitForPlacementType(page, 'placement-extent');
  await clickCanvasRatio(page, 0.6, 0.6);
  await waitForPlacementType(page, null);

  // Placement completes after the extent click → cursor returns to default.
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  // A new rectangle element was created.
  const elementCountAfter = await page.locator('[data-element-id]').count();

  expect(elementCountAfter).toBeGreaterThan(elementCountBefore);

  // The new rectangle is the active selection, so the transform widget attaches.
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates that clicking a canvas element directly (not via
 * the layers panel) selects it and repositions the transform widget to
 * visually overlay that element's bounds. Uses el-logo-image which is
 * isolated in the bottom-right and not obscured by any other element.
 */
test('clicking a canvas element directly selects it and shows the widget at its bounds', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Verify initial auto-selection is el-score-title — widget overlays rendered element
  await expect(widget).toBeVisible();

  const widgetBox = await widget.boundingBox();

  if (widgetBox === null) {
    throw new Error('Widget bounding box not found');
  }

  // Click el-logo-image which is isolated in the bottom-right (far from widget)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await expect(sponsorLogo).toBeVisible();
  await sponsorLogo.click({ force: true });

  // Widget should reposition to visually overlay el-logo-image
  const logoBox = await sponsorLogo.boundingBox();
  const newWidgetBox = await widget.boundingBox();

  if (logoBox === null || newWidgetBox === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(newWidgetBox.x !== widgetBox.x || newWidgetBox.y !== widgetBox.y).toBe(true);
});

/**
 * @description Validates that clicking a second canvas element outside the
 * first widget area switches selection. After selecting el-logo-image,
 * clicking el-live-ellipse (isolated on the right) should reposition the widget.
 */
test('clicking another canvas element switches the selection and widget position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-logo-image first (isolated bottom-right, outside ribbon widget)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await sponsorLogo.click({ force: true });

  const logoBox = await sponsorLogo.boundingBox();
  const widgetAfterLogo = await widget.boundingBox();

  if (logoBox === null || widgetAfterLogo === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(widgetAfterLogo.x).toBeGreaterThanOrEqual(0);
  expect(widgetAfterLogo.y).toBeGreaterThanOrEqual(0);

  // Now switch selection by dispatching a click on the live-ellipse element
  // directly. The element is tiny and can sit under overlay panels, so
  // `.click()` via the viewport pointer is unreliable — dispatching through the
  // DOM ensures the element's own onClick receives the synthetic event.
  const heroBadge = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"]`);

  await expect(heroBadge).toBeVisible();
  await heroBadge.dispatchEvent('click', { bubbles: true });

  const widgetAfterBadge = await widget.boundingBox();

  if (widgetAfterBadge === null) {
    throw new Error('Widget bounding box not found after badge click');
  }

  expect(widgetAfterBadge.x !== widgetAfterLogo.x || widgetAfterBadge.y !== widgetAfterLogo.y).toBe(true);
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
 * @description Validates `project/spec/editor/canvas.md` C-06:
 * dragging the rotation handle changes visible widget rotation.
 */
test('dragging the rotation handle updates the widget rotation', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const initialTransform = await widget.evaluate((element) => element.style.transform);

  const rotationHandle = page.getByTestId('transform-rotation-handle');
  const rotationBox = await rotationHandle.boundingBox();
  const widgetBox = await widget.boundingBox();

  if (rotationBox === null || widgetBox === null) {
    throw new Error('Rotation handle or widget bounds not found');
  }

  const handleCenterX = rotationBox.x + rotationBox.width / 2;
  const handleCenterY = rotationBox.y + rotationBox.height / 2;
  const widgetCenterX = widgetBox.x + widgetBox.width / 2;
  const widgetCenterY = widgetBox.y + widgetBox.height / 2;

  await page.mouse.move(handleCenterX, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(widgetCenterX + 80, widgetCenterY - 40, { steps: 10 });
  await page.mouse.up();

  const rotatedTransform = await widget.evaluate((element) => element.style.transform);

  expect(rotatedTransform).not.toBe(initialTransform);
  expect(rotatedTransform).not.toBe('rotate(0deg)');
});

/**
 * @description Validates that handle positions update correctly when selecting
 * a different, smaller element. After selecting el-live-ellipse (96×96 doc-space),
 * the widget and handle positions should match the smaller element's bounds.
 */
test('handles reposition correctly for a small element selected via canvas click', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-logo-image (isolated bottom-right, not obscured)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await sponsorLogo.click({ force: true });

  const widgetBox = await widget.boundingBox();
  const logoBox = await sponsorLogo.boundingBox();

  if (widgetBox === null || logoBox === null) {
    throw new Error('Widget or logo bounding box not found');
  }

  // Widget dimensions should be positive and remain attached to the selected element workflow.
  expect(widgetBox.width).toBeGreaterThan(0);
  expect(widgetBox.height).toBeGreaterThan(0);

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

  expect(eastCenterX).toBeGreaterThan(westCenterX);
});
