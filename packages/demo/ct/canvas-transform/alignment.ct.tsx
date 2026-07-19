import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';
import { createParentingTransformTestProjectV1 } from '../../src/test-fixtures';
import { FIXTURE_IDS as PARENTING_FIXTURE_IDS } from '../../src/test-fixtures/ids';
import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

/* ------------------------------------------------------------------ */
/*  Pixel-tight alignment: widget MUST overlay element exactly         */
/* ------------------------------------------------------------------ */

const ALIGNMENT_TOLERANCE_PX = 1;

function closeTo(actual: number, expected: number, tolerance: number = ALIGNMENT_TOLERANCE_PX): void {
  expect(
    Math.abs(actual - expected),
    `expected ${String(actual)} to be within ${String(tolerance)}px of ${String(expected)}`,
  ).toBeLessThanOrEqual(tolerance);
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

async function selectElementInStore(page: Page, elementId: string): Promise<void> {
  const selectedElementId = projectFormatV1.idSchema.parse(elementId);

  await expect.poll(() => page.evaluate(() => window.__broadsetProjectEditorStore !== undefined)).toBe(true);

  await page.evaluate((selectedElementId) => {
    const store = window.__broadsetProjectEditorStore;

    if (store === undefined) throw new Error('Expected the v1 project editor store');

    store.getState().selectElement(selectedElementId);
  }, selectedElementId);
}

function updateParentTransform(
  project: projectFormatV1.BroadsetProjectV1,
  transform: projectFormatV1.ElementTransform,
): projectFormatV1.BroadsetProjectV1 {
  return {
    ...project,
    documents: project.documents.map((document) => ({
      ...document,
      elements: document.elements.map(
        (element): projectFormatV1.Element =>
          element.id === PARENTING_FIXTURE_IDS.promoGroup && element.kind === 'group' ?
            {
              ...element,
              geometry: { ...element.geometry, transform },
              group: { clipChildren: false },
            }
          : element,
      ),
    })),
  };
}

function createRotatedParentFixture(): projectFormatV1.BroadsetProjectV1 {
  const fixture = createParentingTransformTestProjectV1();
  const radians = Math.PI / 6;

  return updateParentTransform(fixture, {
    kind: 'affine2d',
    matrix: [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 650, 320],
  });
}

function createParent3dFixture(stylePatch: {
  readonly rotateX?: number | undefined;
  readonly rotateY?: number | undefined;
  readonly translateZ?: number | undefined;
}): projectFormatV1.BroadsetProjectV1 {
  const fixture = createParentingTransformTestProjectV1();
  const rotateX = ((stylePatch.rotateX ?? 0) * Math.PI) / 180;
  const rotateY = ((stylePatch.rotateY ?? 0) * Math.PI) / 180;
  const cosineX = Math.cos(rotateX);
  const sineX = Math.sin(rotateX);
  const cosineY = Math.cos(rotateY);
  const sineY = Math.sin(rotateY);
  const transform: projectFormatV1.ElementTransform = {
    kind: 'matrix3d',
    matrix: [
      cosineY,
      sineX * sineY,
      -cosineX * sineY,
      0,
      0,
      cosineX,
      sineX,
      0,
      sineY,
      -sineX * cosineY,
      cosineX * cosineY,
      0,
      650,
      320,
      stylePatch.translateZ ?? 0,
      1,
    ],
  };

  return updateParentTransform(fixture, transform);
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

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.initialSelection);

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

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.initialSelection);

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

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.initialSelection);

  closeTo(widget.x, element.x);
  closeTo(widget.y, element.y);
  closeTo(widget.width, element.width);
  closeTo(widget.height, element.height);
});

/**
 * @description Parent transform regression: selecting a child inside a rotated
 * group must align the transform widget with the child's rendered browser
 * bounds, including the transform inherited from its parent chain.
 */
test('widget pixel-aligns with a child inside a rotated parent group', async ({ mount, page }) => {
  await mount(<DemoAppStored project={createRotatedParentFixture()} />);

  const child = page.locator(`[data-element-id="${PARENTING_FIXTURE_IDS.promoQr}"]`);

  await expect(child).toBeVisible();
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const { widget, element } = await getBoxes(page, PARENTING_FIXTURE_IDS.promoQr);
  const rotatedTolerance = 2;

  closeTo(widget.x, element.x, rotatedTolerance);
  closeTo(widget.y, element.y, rotatedTolerance);
  closeTo(widget.width, element.width, rotatedTolerance);
  closeTo(widget.height, element.height, rotatedTolerance);
});

/**
 * @description Parent transform regression: dragging a child widget inside a
 * rotated group must interpret pointer movement in screen space and commit the
 * inverse parent transform to the child's local position.
 */
test('dragging a child inside a rotated parent follows the screen-space pointer', async ({ mount, page }) => {
  await mount(<DemoAppStored project={createRotatedParentFixture()} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const elementBefore = (await getBoxes(page, PARENTING_FIXTURE_IDS.promoQr)).element;
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) {
    throw new Error('Transform bounds missing');
  }

  const startX = boundsBox.x + boundsBox.width / 2;
  const startY = boundsBox.y + boundsBox.height / 2;
  const dragDistancePx = 60;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dragDistancePx, startY, { steps: 8 });
  await page.mouse.up();

  const elementAfter = (await getBoxes(page, PARENTING_FIXTURE_IDS.promoQr)).element;
  const beforeCenterX = elementBefore.x + elementBefore.width / 2;
  const beforeCenterY = elementBefore.y + elementBefore.height / 2;
  const afterCenterX = elementAfter.x + elementAfter.width / 2;
  const afterCenterY = elementAfter.y + elementAfter.height / 2;

  expect(afterCenterX - beforeCenterX).toBeGreaterThan(45);
  closeTo(afterCenterY, beforeCenterY, 3);
});

async function dragSelectedChildByScreenDelta(
  page: Page,
  delta: { readonly x: number; readonly y: number },
): Promise<{
  readonly beforeCenterX: number;
  readonly beforeCenterY: number;
  readonly afterCenterX: number;
  readonly afterCenterY: number;
}> {
  const elementBefore = (await getBoxes(page, PARENTING_FIXTURE_IDS.promoQr)).element;
  const bounds = page.getByTestId('transform-bounds');
  const startPoint = await bounds.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Transform bounds missing');
    }

    const probe = document.createElement('div');

    probe.style.height = '0px';
    probe.style.left = `${String(element.offsetWidth / 2)}px`;
    probe.style.pointerEvents = 'none';
    probe.style.position = 'absolute';
    probe.style.top = `${String(element.offsetHeight / 2)}px`;
    probe.style.width = '0px';
    element.appendChild(probe);

    try {
      const rect = probe.getBoundingClientRect();

      return { x: rect.left, y: rect.top };
    } finally {
      probe.remove();
    }
  });

  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(startPoint.x + delta.x, startPoint.y + delta.y, { steps: 8 });
  await page.mouse.up();

  const elementAfter = (await getBoxes(page, PARENTING_FIXTURE_IDS.promoQr)).element;

  return {
    beforeCenterX: elementBefore.x + elementBefore.width / 2,
    beforeCenterY: elementBefore.y + elementBefore.height / 2,
    afterCenterX: elementAfter.x + elementAfter.width / 2,
    afterCenterY: elementAfter.y + elementAfter.height / 2,
  };
}

async function dragSelectedChildHandleByScreenDelta(
  page: Page,
  handle: 'e' | 's',
  delta: { readonly x: number; readonly y: number },
): Promise<{
  readonly afterActiveEdgeCenterX: number;
  readonly afterActiveEdgeCenterY: number;
  readonly afterHandleCenterX: number;
  readonly afterHandleCenterY: number;
  readonly afterOppositeEdgeCenterX: number;
  readonly afterOppositeEdgeCenterY: number;
  readonly beforeActiveEdgeCenterX: number;
  readonly beforeActiveEdgeCenterY: number;
  readonly beforeHandleCenterX: number;
  readonly beforeHandleCenterY: number;
  readonly beforeOppositeEdgeCenterX: number;
  readonly beforeOppositeEdgeCenterY: number;
}> {
  const getHandleCenter = async (): Promise<{ readonly x: number; readonly y: number }> => {
    const handleBox = await page.getByTestId(`transform-handle-${handle}`).boundingBox();

    if (handleBox === null) {
      throw new Error(`Transform handle ${handle} missing`);
    }

    return {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
  };

  const getEdgeCenters = async (): Promise<{
    readonly active: { readonly x: number; readonly y: number };
    readonly opposite: { readonly x: number; readonly y: number };
  }> =>
    page.getByTestId('demo-transform-widget').evaluate((element, resizeHandle) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Transform widget missing');
      }

      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const points =
        resizeHandle === 'e' ?
          {
            active: { x: width, y: height / 2 },
            opposite: { x: 0, y: height / 2 },
          }
        : {
            active: { x: width / 2, y: height },
            opposite: { x: width / 2, y: 0 },
          };
      const probes = Object.entries(points).map(([name, point]) => {
        const probe = document.createElement('div');

        probe.dataset['probeName'] = name;
        probe.style.height = '0px';
        probe.style.left = `${String(point.x)}px`;
        probe.style.pointerEvents = 'none';
        probe.style.position = 'absolute';
        probe.style.top = `${String(point.y)}px`;
        probe.style.width = '0px';
        element.appendChild(probe);

        return probe;
      });

      try {
        const measured = Object.fromEntries(
          probes.map((probe) => {
            const rect = probe.getBoundingClientRect();

            return [probe.dataset['probeName'] ?? '', { x: rect.left, y: rect.top }];
          }),
        );

        return measured as {
          readonly active: { readonly x: number; readonly y: number };
          readonly opposite: { readonly x: number; readonly y: number };
        };
      } finally {
        for (const probe of probes) {
          probe.remove();
        }
      }
    }, handle);

  const beforeHandle = await getHandleCenter();
  const beforeEdges = await getEdgeCenters();
  const startX = beforeHandle.x;
  const startY = beforeHandle.y;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 8 });
  await page.mouse.up();

  const afterHandle = await getHandleCenter();
  const afterEdges = await getEdgeCenters();

  return {
    afterActiveEdgeCenterX: afterEdges.active.x,
    afterActiveEdgeCenterY: afterEdges.active.y,
    afterHandleCenterX: afterHandle.x,
    afterHandleCenterY: afterHandle.y,
    afterOppositeEdgeCenterX: afterEdges.opposite.x,
    afterOppositeEdgeCenterY: afterEdges.opposite.y,
    beforeActiveEdgeCenterX: beforeEdges.active.x,
    beforeActiveEdgeCenterY: beforeEdges.active.y,
    beforeHandleCenterX: beforeHandle.x,
    beforeHandleCenterY: beforeHandle.y,
    beforeOppositeEdgeCenterX: beforeEdges.opposite.x,
    beforeOppositeEdgeCenterY: beforeEdges.opposite.y,
  };
}

async function getElementRotationInStore(page: Page, elementId: string): Promise<number> {
  return page.evaluate((targetElementId) => {
    const state = window.__broadsetProjectEditorStore?.getState();
    const element = state?.project.documents
      .find((document) => document.id === state.activeDocumentId)
      ?.elements.find((entry) => entry.id === targetElementId);
    const matrix = element?.geometry.transform.matrix;

    return matrix === undefined ? Number.NaN : (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  }, elementId);
}

async function rotateSelectedChildFromHandleToLocalRightEdge(page: Page): Promise<number> {
  const handleBox = await page.getByTestId('transform-rotation-handle').boundingBox();

  if (handleBox === null) {
    throw new Error('Rotation handle missing');
  }

  const endPoint = await page.getByTestId('demo-transform-widget').evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Transform widget missing');
    }

    const probe = document.createElement('div');

    probe.style.height = '0px';
    probe.style.left = `${String(element.offsetWidth)}px`;
    probe.style.pointerEvents = 'none';
    probe.style.position = 'absolute';
    probe.style.top = `${String(element.offsetHeight / 2)}px`;
    probe.style.width = '0px';
    element.appendChild(probe);

    try {
      const rect = probe.getBoundingClientRect();

      return { x: rect.left, y: rect.top };
    } finally {
      probe.remove();
    }
  });
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 8 });
  await page.mouse.up();

  return getElementRotationInStore(page, PARENTING_FIXTURE_IDS.promoQr);
}

/**
 * @description Child drag interactions under parent rotateY must use the full
 * projected transform chain. A 60px horizontal pointer drag should move the
 * rendered child center by the same screen-space distance instead of the
 * foreshortened local delta.
 */
test('dragging a child inside a rotateY parent follows the screen-space pointer', async ({ mount, page }) => {
  await mount(<DemoAppStored project={createParent3dFixture({ rotateY: 60 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const movement = await dragSelectedChildByScreenDelta(page, { x: 60, y: 0 });

  closeTo(movement.afterCenterX - movement.beforeCenterX, 60, 4);
  closeTo(movement.afterCenterY, movement.beforeCenterY, 4);
});

/**
 * @description Child drag interactions under parent rotateX must also project
 * vertical pointer movement through the full 3D transform chain.
 */
test('dragging a child inside a rotateX parent follows the screen-space pointer', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(<DemoAppStored project={createParent3dFixture({ rotateX: 60 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const movement = await dragSelectedChildByScreenDelta(page, { x: 0, y: 60 });

  closeTo(movement.afterCenterX, movement.beforeCenterX, 4);
  closeTo(movement.afterCenterY - movement.beforeCenterY, 60, 4);
});

/**
 * @description Parent translateZ changes the projected scale under
 * perspective; child drag still needs to follow the user's screen-space
 * pointer instead of over-shooting by the perspective scale.
 */
test('dragging a child inside a translateZ parent follows the screen-space pointer', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mount(<DemoAppStored project={createParent3dFixture({ translateZ: 500 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const movement = await dragSelectedChildByScreenDelta(page, { x: 60, y: 0 });

  closeTo(movement.afterCenterX - movement.beforeCenterX, 60, 4);
  closeTo(movement.afterCenterY, movement.beforeCenterY, 4);
});

/**
 * @description Child resize under parent rotateY must project pointer movement
 * through the same 3D parent plane as drag. Pulling the east handle 60px right
 * should advance the active edge by roughly 60 rendered pixels on its primary
 * axis, not by the foreshortened local delta.
 */
test('resizing a child east handle inside a rotateY parent follows the projected primary axis', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppStored project={createParent3dFixture({ rotateY: 60 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const movement = await dragSelectedChildHandleByScreenDelta(page, 'e', { x: 60, y: 0 });

  closeTo(movement.afterHandleCenterX - movement.beforeHandleCenterX, 60, 4);
  closeTo(movement.afterActiveEdgeCenterX - movement.beforeActiveEdgeCenterX, 60, 4);
  closeTo(movement.afterOppositeEdgeCenterX, movement.beforeOppositeEdgeCenterX, 4);
  closeTo(movement.afterOppositeEdgeCenterY, movement.beforeOppositeEdgeCenterY, 4);
});

/**
 * @description Child resize under parent rotateX must project vertical pointer
 * movement through perspective so the south handle advances on its primary
 * visual axis instead of using an unprojected screen delta.
 */
test('resizing a child south handle inside a rotateX parent follows the projected primary axis', async ({
  mount,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(<DemoAppStored project={createParent3dFixture({ rotateX: 60 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const movement = await dragSelectedChildHandleByScreenDelta(page, 's', { x: 0, y: 60 });

  closeTo(movement.afterHandleCenterY - movement.beforeHandleCenterY, 60, 4);
  closeTo(movement.afterActiveEdgeCenterY - movement.beforeActiveEdgeCenterY, 60, 4);
  closeTo(movement.afterOppositeEdgeCenterX, movement.beforeOppositeEdgeCenterX, 4);
  closeTo(movement.afterOppositeEdgeCenterY, movement.beforeOppositeEdgeCenterY, 4);
});

/**
 * @description Child rotation under parent 3D transforms must use projected
 * parent-plane coordinates. Dragging from the rotation handle to the local
 * right edge should commit roughly a quarter-turn instead of a screen-bounds
 * approximation.
 */
test('rotating a child inside a rotateY parent follows projected local-plane angles', async ({ mount, page }) => {
  await mount(<DemoAppStored project={createParent3dFixture({ rotateY: 60 })} />);
  await selectElementInStore(page, PARENTING_FIXTURE_IDS.promoQr);
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const rotation = await rotateSelectedChildFromHandleToLocalRightEdge(page);

  closeTo(rotation, 90, 8);
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

  const { widget, element } = await getBoxes(page, FIXTURE_IDS.initialSelection);

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
  await selectElementInStore(page, FIXTURE_IDS.logo);

  const rotationXField = page.getByRole('textbox', { name: 'Rotation X' });

  await expect(rotationXField).toBeVisible();
  await rotationXField.fill('35');
  await rotationXField.press('Enter');

  const widgetTransform = await page
    .getByTestId('demo-transform-widget')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const elementTransform = await page
    .locator(`[data-element-id="${FIXTURE_IDS.logo}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

  expect(widgetTransform).toBe(elementTransform);
  expect(widgetTransform).toContain('matrix3d(');

  // Bounding boxes should still track (3D projection is identical because
  // both share the same perspective context inside canvasRoot). Use a small
  // tolerance to absorb sub-pixel rounding from the 3D rasterizer.
  const threeDTolerance = 2;
  const { widget, element } = await getBoxes(page, FIXTURE_IDS.logo);

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
  await selectElementInStore(page, FIXTURE_IDS.logo);

  const rotationYField = page.getByRole('textbox', { name: 'Rotation Y' });

  await expect(rotationYField).toBeVisible();
  await rotationYField.fill('25');
  await rotationYField.press('Enter');

  const widgetTransform = await page
    .getByTestId('demo-transform-widget')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const elementTransform = await page
    .locator(`[data-element-id="${FIXTURE_IDS.logo}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

  expect(widgetTransform).toBe(elementTransform);
  expect(widgetTransform).toContain('matrix3d(');
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

  await selectElementInStore(page, FIXTURE_IDS.logo);

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
 * merely declared. Orthographic rotateX keeps both horizontal edge widths
 * equal, while perspective makes the near and far edges project differently.
 */
test('perspective actually projects elements with depth-dependent edge widths', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  await selectElementInStore(page, FIXTURE_IDS.logo);

  const elementLocator = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);
  const rotationXField = page.getByRole('textbox', { name: 'Rotation X' });

  await expect(rotationXField).toBeVisible();
  await rotationXField.fill('70');
  await rotationXField.press('Enter');

  const edgeWidths = await elementLocator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected a rendered v1 element');

    const points = [
      { x: 0, y: 0 },
      { x: element.offsetWidth, y: 0 },
      { x: 0, y: element.offsetHeight },
      { x: element.offsetWidth, y: element.offsetHeight },
    ];
    const probes = points.map((point) => {
      const probe = document.createElement('div');

      probe.style.height = '0px';
      probe.style.left = `${String(point.x)}px`;
      probe.style.position = 'absolute';
      probe.style.top = `${String(point.y)}px`;
      probe.style.width = '0px';
      element.appendChild(probe);

      return probe;
    });

    try {
      const screen = probes.map((probe) => {
        const bounds = probe.getBoundingClientRect();

        return { x: bounds.left, y: bounds.top };
      });
      const topLeft = screen[0];
      const topRight = screen[1];
      const bottomLeft = screen[2];
      const bottomRight = screen[3];

      if (topLeft === undefined || topRight === undefined || bottomLeft === undefined || bottomRight === undefined) {
        throw new Error('Expected all projected edge probes');
      }

      return {
        top: Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
        bottom: Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
      };
    } finally {
      probes.forEach((probe) => {
        probe.remove();
      });
    }
  });

  expect(Math.abs(edgeWidths.top - edgeWidths.bottom)).toBeGreaterThan(edgeWidths.top * 0.01);
});
