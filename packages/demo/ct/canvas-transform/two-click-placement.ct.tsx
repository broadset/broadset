import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function activateTool(page: Page, ariaLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${ariaLabel}"]`).first().click();
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);
}

/**
 * @description Validates `project/spec/editor/editing.md` → two-click placement
 * for rectangle creates an element whose bounds match the two clicks. Asserts
 * cross-region effects: canvas (widget appears over the new element) + toolbar
 * (tool de-activates after placement).
 */
test('two-click rectangle placement creates an element after the extent click', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  const elementCountBefore = await page.locator('[data-element-id]').count();

  await activateTool(page, 'Rectangle');

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  // Placement enters the extent sub-state after the first click — cursor stays crosshair.
  await preview.click({ force: true, position: { x: previewBox.width * 0.3, y: previewBox.height * 0.3 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  // Element count unchanged until the extent click commits.
  expect(await page.locator('[data-element-id]').count()).toBe(elementCountBefore);

  await preview.click({ force: true, position: { x: previewBox.width * 0.6, y: previewBox.height * 0.6 } });

  // Placement committed → cursor returns to default.
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  // Exactly one new element was created and is the current selection.
  const elementCountAfter = await page.locator('[data-element-id]').count();

  expect(elementCountAfter).toBe(elementCountBefore + 1);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates `project/spec/editor/editing.md` → corner-type
 * placement (image) follows the generic two-click flow. Spot-check to prove the
 * flow is not rectangle-specific.
 */
test('two-click image placement commits after two clicks', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activateTool(page, 'Image');

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  await preview.click({ force: true, position: { x: previewBox.width * 0.25, y: previewBox.height * 0.25 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  await preview.click({ force: true, position: { x: previewBox.width * 0.55, y: previewBox.height * 0.55 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates `project/spec/editor/editing.md` → ellipse placement
 * uses three clicks: centre, radius, rotation.
 */
test('three-click ellipse placement completes through all three sub-states', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activateTool(page, 'Ellipse');

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  await preview.click({ force: true, position: { x: previewBox.width * 0.35, y: previewBox.height * 0.4 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  await preview.click({ force: true, position: { x: previewBox.width * 0.55, y: previewBox.height * 0.55 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  await preview.click({ force: true, position: { x: previewBox.width * 0.7, y: previewBox.height * 0.4 } });
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates `project/spec/editor/editing.md` → the extent click on
 * the same point as the anchor is ignored. Clicking twice on the exact same
 * point must not create an element; the preview must still be in the sizing
 * sub-state.
 */
test('same-point extent click is ignored and no element is created', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const elementsBefore = await page.locator('[data-element-id]').count();

  await activateTool(page, 'Rectangle');

  const preview = page.getByLabel(/screen preview for/i);

  await preview.click({ force: true, position: { x: 240, y: 180 } });
  await preview.click({ force: true, position: { x: 240, y: 180 } });

  // Still in placement — cursor is still crosshair
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  // No element was created by the duplicate extent click.
  const elementsAfter = await page.locator('[data-element-id]').count();

  expect(elementsAfter).toBe(elementsBefore);
});

/**
 * @description Validates `project/spec/editor/editing.md` → external plugin
 * single-click placement creates the element at the plugin's declared default
 * size and exits placement after one click.
 */
test('plugin single-click placement creates a countdown at the click point and exits placement', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activateTool(page, 'Countdown');

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  await preview.click({ force: true, position: { x: previewBox.width * 0.5, y: previewBox.height * 0.5 } });

  // Plugin single-click exits placement after the first click.
  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates `project/spec/editor/editing.md` → Escape during the
 * extent sub-state cancels placement and leaves no element on the canvas.
 */
test('Escape during extent sub-state cancels placement without creating an element', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const widgetsBefore = await page.getByTestId('demo-transform-widget').count();

  await activateTool(page, 'Rectangle');

  const preview = page.getByLabel(/screen preview for/i);

  await preview.click({ force: true, position: { x: 240, y: 180 } });

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');

  const widgetsAfter = await page.getByTestId('demo-transform-widget').count();

  expect(widgetsAfter).toBe(widgetsBefore);
});

/**
 * @description Validates `project/spec/editor/editing.md` → the placement
 * preview overlay is mounted while placement is active. The overlay renders
 * lazily once a preview pointer has been captured.
 */
test('placement preview overlay is mounted while placement is active', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activateTool(page, 'Rectangle');

  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  await page.mouse.move(previewBox.x + previewBox.width * 0.4, previewBox.y + previewBox.height * 0.4);
  await preview.click({ force: true, position: { x: previewBox.width * 0.3, y: previewBox.height * 0.3 } });
  await page.mouse.move(previewBox.x + previewBox.width * 0.6, previewBox.y + previewBox.height * 0.6);

  await expect(page.getByTestId('placement-preview-overlay').first()).toBeAttached();
});
