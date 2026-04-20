import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS } from '../fixture-selectors';

/* ------------------------------------------------------------------ */
/*  Pixel-tight alignment: widget MUST overlay element exactly         */
/* ------------------------------------------------------------------ */

const ALIGNMENT_TOLERANCE_PX = 1;

function closeTo(actual: number, expected: number, tolerance: number = ALIGNMENT_TOLERANCE_PX): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

async function getBoxes(
  page: Page,
  elementId: string,
): Promise<{
  readonly widget: { x: number; y: number; width: number; height: number };
  readonly element: { x: number; y: number; width: number; height: number };
}> {
  const widget = page.getByTestId('demo-transform-widget');
  const elementLocator = page.locator(`[data-element-id="${elementId}"]`);
  const widgetBox = await widget.boundingBox();
  const elementBox = await elementLocator.boundingBox();

  if (widgetBox === null || elementBox === null) {
    throw new Error('Widget or element bounding box not found');
  }

  return { widget: widgetBox, element: elementBox };
}

/**
 * @description The widget lives inside the renderer's overlay layer (sibling
 * of the element layer, inside canvasRoot) so it inherits the exact same
 * pan/zoom/contentScale/perspective transform chain as the selected element.
 * Widget and element bounding boxes must agree within 1px at default viewport.
 */
test('widget pixel-aligns with the selected element at default viewport', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.title);

  closeTo(widget.x, element.x);
  closeTo(widget.y, element.y);
  closeTo(widget.width, element.width);
  closeTo(widget.height, element.height);
});

/**
 * @description Alignment holds when the viewport aspect ratio is much wider
 * than the canvas aspect ratio. Horizontal letterbox offset used to cause
 * the widget to drift right by half the letterbox width — this asserts the
 * bug cannot regress.
 */
test('widget pixel-aligns after horizontal letterbox (wide viewport)', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 600 });
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.title);

  closeTo(widget.x, element.x);
  closeTo(widget.y, element.y);
  closeTo(widget.width, element.width);
  closeTo(widget.height, element.height);
});

/**
 * @description Alignment also holds when the viewport is tall (vertical
 * letterbox). Symmetric counterpart to the wide-viewport test.
 */
test('widget pixel-aligns after vertical letterbox (tall viewport)', async ({ mount, page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.title);

  closeTo(widget.x, element.x);
  closeTo(widget.y, element.y);
  closeTo(widget.width, element.width);
  closeTo(widget.height, element.height);
});

/**
 * @description Panning the canvas MUST NOT cause the widget to drift from the
 * element. The overlay inherits the pan transform automatically; this test
 * exercises that by pressing Shift to initiate a pan drag and asserting
 * alignment afterwards.
 */
test('widget stays aligned with the element after a pan gesture', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  const startX = previewBox.x + previewBox.width / 2;
  const startY = previewBox.y + previewBox.height / 2;

  await page.keyboard.down('Shift');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 80, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.title);

  closeTo(widget.x, element.x);
  closeTo(widget.y, element.y);
  closeTo(widget.width, element.width);
  closeTo(widget.height, element.height);
});

/* ------------------------------------------------------------------ */
/*  3D transform parity: widget transform == element transform         */
/* ------------------------------------------------------------------ */

/**
 * @description Applying rotateX via the properties panel must propagate the
 * 3D rotation to the widget: widget and element share the exact CSS
 * transform string (same source: buildElementTransform in @broadset/renderer)
 * and the widget follows the element into the 3D projected bounds.
 */
test('widget applies element rotateX and follows the 3D-projected element', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const rotationXField = page.getByRole('textbox', { name: 'Rotation X' });

  await expect(rotationXField).toBeVisible();
  await rotationXField.fill('35');
  await rotationXField.press('Enter');

  const widgetTransform = await page
    .getByTestId('demo-transform-widget')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const elementTransform = await page
    .locator(`[data-element-id="${FIXTURE_IDS.title}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

  expect(widgetTransform).toBe(elementTransform);
  expect(widgetTransform).toContain('rotateX(35deg)');

  // Bounding boxes should still track (3D projection is identical because
  // both share the same perspective context inside canvasRoot). Use a small
  // tolerance to absorb sub-pixel rounding from the 3D rasterizer.
  const threeDTolerance = 2;
  const { widget, element } = await getBoxes(page, FIXTURE_IDS.title);

  closeTo(widget.x, element.x, threeDTolerance);
  closeTo(widget.y, element.y, threeDTolerance);
  closeTo(widget.width, element.width, threeDTolerance);
  closeTo(widget.height, element.height, threeDTolerance);
});

/**
 * @description Same parity guarantee for rotateY.
 */
test('widget applies element rotateY and follows the 3D-projected element', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const rotationYField = page.getByRole('textbox', { name: 'Rotation Y' });

  await expect(rotationYField).toBeVisible();
  await rotationYField.fill('25');
  await rotationYField.press('Enter');

  const widgetTransform = await page
    .getByTestId('demo-transform-widget')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const elementTransform = await page
    .locator(`[data-element-id="${FIXTURE_IDS.title}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

  expect(widgetTransform).toBe(elementTransform);
  expect(widgetTransform).toContain('rotateY(25deg)');
});

/* ------------------------------------------------------------------ */
/*  Perspective: CanvasSettings.perspective MUST drive canvasRoot      */
/* ------------------------------------------------------------------ */

/**
 * @description Per `project/spec/renderer/spec.md`, CanvasSettings.perspective
 * MUST be applied as a CSS perspective on the canvas container so that 3D
 * transforms render with real depth. Default perspective is 1000px.
 */
test('canvas transform layer carries the CanvasSettings perspective so 3D transforms project', async ({
  mount,
  page,
}) => {
  await mount(<DemoApp />);

  const transformLayer = page.locator('[data-broadset-canvas-transform="true"]');

  await expect(transformLayer).toBeVisible();

  const perspective = await transformLayer.evaluate((el) => (el as HTMLElement).style.perspective);

  expect(perspective).toBe('1000px');
});

/**
 * @description Structural guard for the 3D perspective chain. CSS promotes
 * `transform-style: preserve-3d` to `flat` on the used value when the element
 * has any of these properties: overflow!=visible, clip-path, opacity<1,
 * filter, mask, mix-blend-mode, isolation:isolate, contain:paint,
 * backdrop-filter. If any ancestor of a rendered element between the element
 * and the node bearing `perspective` carries one of these properties, 3D
 * rotations collapse and perspective foreshortening silently stops working.
 *
 * `getComputedStyle.transformStyle` returns the SPECIFIED value, not the
 * USED value, so it can't detect the promotion. Instead this test walks the
 * DOM chain and fails on any flat-forcing property. This is the canary that
 * would have caught the `clip-path` regression where the visual `rotateY`
 * test passed (bounding box shrinks under orthographic projection too) but
 * perspective was silently disabled.
 */
test('3D chain from selected element up to perspective ancestor has no flat-forcing properties', async ({
  mount,
  page,
}) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  await page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`).click({ force: true });

  const violations = await page.evaluate(
    ({ elementId }) => {
      const markerFor = (node: HTMLElement): string => {
        if (node.getAttribute('data-broadset-canvas-transform') !== null) return 'canvas-transform-layer';
        if (node.getAttribute('data-broadset-canvas-root') !== null) return 'canvas-root';
        if (node.getAttribute('data-broadset-element-layer') !== null) return 'element-layer';

        return node.tagName.toLowerCase();
      };

      const collectViolations = (node: HTMLElement, marker: string): string[] => {
        const style = getComputedStyle(node);
        const out: string[] = [];

        if (style.overflow !== 'visible') out.push(`${marker}:overflow=${style.overflow}`);
        if (style.clipPath !== 'none') out.push(`${marker}:clipPath=${style.clipPath}`);
        if (parseFloat(style.opacity) < 1) out.push(`${marker}:opacity=${style.opacity}`);
        if (style.filter !== 'none') out.push(`${marker}:filter=${style.filter}`);
        if (style.mask !== 'none' && style.mask !== '') out.push(`${marker}:mask=${style.mask}`);
        if (style.mixBlendMode !== 'normal') out.push(`${marker}:mixBlendMode=${style.mixBlendMode}`);
        if (style.isolation === 'isolate') out.push(`${marker}:isolation=isolate`);
        if (style.contain.includes('paint')) out.push(`${marker}:contain=${style.contain}`);

        if (style.backdropFilter !== 'none' && style.backdropFilter !== '') {
          out.push(`${marker}:backdropFilter=${style.backdropFilter}`);
        }

        return out;
      };

      const element = document.querySelector(`[data-element-id="${elementId}"]`);

      if (!(element instanceof HTMLElement)) return ['element-not-found'];

      const issues: string[] = [];
      let node: HTMLElement | null = element.parentElement;

      while (node !== null) {
        issues.push(...collectViolations(node, markerFor(node)));

        if (getComputedStyle(node).perspective !== 'none') return issues;

        node = node.parentElement;
      }

      return ['no-perspective-ancestor-found', ...issues];
    },
    { elementId: FIXTURE_IDS.logo },
  );

  expect(violations).toEqual([]);
});

/**
 * @description Guards the canvas background from participating in the 3D
 * rendering context. If the background lived on an element INSIDE the
 * `transform-style: preserve-3d` chain (e.g. canvasRoot), it would occupy a
 * plane at z=0 and CSS depth-sorting would render any element rotated into
 * negative z BEHIND that plane — visually clipping "the half behind z=0" as
 * reported. Keeping the background on canvasScaleShell (outside the 3D
 * context) makes it a plain 2D backdrop that never occludes 3D-rotated
 * elements. This structural test catches any regression where the
 * background bleeds back into the 3D chain.
 */
test('canvas background lives outside the 3D rendering context', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const state = await page.evaluate(() => {
    const canvasRoot = document.querySelector('[data-broadset-canvas-root="true"]');
    const transformLayer = document.querySelector('[data-broadset-canvas-transform="true"]');
    const elementLayer = document.querySelector('[data-broadset-element-layer="true"]');

    if (
      !(canvasRoot instanceof HTMLElement) ||
      !(transformLayer instanceof HTMLElement) ||
      !(elementLayer instanceof HTMLElement)
    ) {
      return { error: 'layers-missing' as const };
    }

    const read = (el: HTMLElement): { bg: string; image: string } => ({
      bg: getComputedStyle(el).backgroundColor,
      image: getComputedStyle(el).backgroundImage,
    });

    return {
      canvasRoot: read(canvasRoot),
      transformLayer: read(transformLayer),
      elementLayer: read(elementLayer),
    };
  });

  if ('error' in state) throw new Error(state.error);

  // Any element inside the preserve-3d chain (transform layer, canvas root,
  // element layer) MUST NOT carry a visible background — the background
  // belongs on canvasScaleShell or further out.
  const transparentBackgroundColors = new Set(['rgba(0, 0, 0, 0)', 'transparent']);

  expect(transparentBackgroundColors.has(state.canvasRoot.bg)).toBe(true);
  expect(state.canvasRoot.image).toBe('none');
  expect(transparentBackgroundColors.has(state.transformLayer.bg)).toBe(true);
  expect(state.transformLayer.image).toBe('none');
  expect(transparentBackgroundColors.has(state.elementLayer.bg)).toBe(true);
  expect(state.elementLayer.image).toBe('none');
});

/**
 * @description Empirical check that perspective is actually projecting, not
 * merely declared. A flat (orthographic) rotateX leaves an element's rendered
 * WIDTH unchanged — only the vertical dimension foreshortens. With
 * perspective, the near edge (top, after rotateX(60)) projects WIDER than
 * the far edge, so the 2D bounding box width GROWS above the unrotated
 * width. This exploits the asymmetry that orthographic projection cannot
 * reproduce.
 */
test('perspective actually projects elements: rotateX widens the rendered bounding box', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  await page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`).click({ force: true });

  const elementLocator = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);
  const beforeBox = await elementLocator.boundingBox();

  if (beforeBox === null) throw new Error('element box missing before rotation');

  const rotationXField = page.getByRole('textbox', { name: 'Rotation X' });

  await expect(rotationXField).toBeVisible();
  await rotationXField.fill('70');
  await rotationXField.press('Enter');

  const afterBox = await elementLocator.boundingBox();

  if (afterBox === null) throw new Error('element box missing after rotation');

  // Orthographic rotateX(70) leaves width unchanged; perspective(1000)
  // makes the top edge project noticeably wider than the bottom, so the
  // 2D bounding box grows. Demand a measurable increase — 1% is below
  // pixel noise but clearly impossible under orthographic projection.
  expect(afterBox.width).toBeGreaterThan(beforeBox.width * 1.01);
});
