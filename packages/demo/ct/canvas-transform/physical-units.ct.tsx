import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { createParentingTransformTestProjectV1 } from '../../src/test-fixtures';
import { FIXTURE_IDS } from '../../src/test-fixtures/ids';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

const TOLERANCE_PX = 4;
const PROMO_QR_ID = projectFormatV1.idSchema.parse(FIXTURE_IDS.promoQr);

function millimetreGeometry(
  geometry: projectFormatV1.ElementGeometry,
  parentId: projectFormatV1.Id,
): projectFormatV1.ElementGeometry {
  const bounds = { width: geometry.bounds.width / 10, height: geometry.bounds.height / 10 };

  if (geometry.transform.kind === 'affine2d') {
    const [a, b, c, d, x, y] = geometry.transform.matrix;

    return {
      ...geometry,
      bounds,
      transform:
        parentId === FIXTURE_IDS.promoGroup ?
          {
            kind: 'matrix3d',
            matrix: [0.5, 0, -Math.sqrt(3) / 2, 0, 0, 1, 0, 0, Math.sqrt(3) / 2, 0, 0.5, 0, 65, 32, 0, 1],
          }
        : { kind: 'affine2d', matrix: [a, b, c, d, x / 10, y / 10] },
    };
  }

  return { ...geometry, bounds };
}

function physicalNestedFixture(): projectFormatV1.BroadsetProjectV1 {
  const project = createParentingTransformTestProjectV1();

  return {
    ...project,
    documents: project.documents.map((document) => ({
      ...document,
      surface: {
        ...document.surface,
        dpi: 254,
        padding: {
          top: document.surface.padding.top / 10,
          right: document.surface.padding.right / 10,
          bottom: document.surface.padding.bottom / 10,
          left: document.surface.padding.left / 10,
        },
        size: [document.surface.size[0] / 10, document.surface.size[1] / 10],
        unit: 'mm',
      },
      elements: document.elements.map((element) => ({
        ...element,
        geometry: millimetreGeometry(element.geometry, element.id),
      })),
    })),
  };
}

async function selectNestedQr(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__broadsetProjectEditorStore !== undefined)).toBe(true);

  await page.evaluate((elementId) => {
    const store = window.__broadsetProjectEditorStore;

    if (store === undefined) throw new Error('Expected the v1 project editor store');

    store.getState().selectElement(elementId);
  }, PROMO_QR_ID);
}

async function box(
  locator: ReturnType<Page['getByTestId']>,
): Promise<NonNullable<Awaited<ReturnType<typeof locator.boundingBox>>>> {
  const value = await locator.boundingBox();

  if (value === null) throw new Error('Expected a rendered bounding box');

  return value;
}

function closeTo(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE_PX);
}

test('mm nested 3D selection aligns and projects drag and resize gestures in CSS pixels', async ({ mount, page }) => {
  await mount(<DemoAppStored project={physicalNestedFixture()} />);
  await selectNestedQr(page);

  const widget = page.getByTestId('demo-transform-widget');
  const element = page.locator(`[data-element-id="${FIXTURE_IDS.promoQr}"]`);
  const initialWidget = await box(widget);
  const initialElement = await box(element);

  closeTo(initialWidget.x, initialElement.x);
  closeTo(initialWidget.y, initialElement.y);
  closeTo(initialWidget.width, initialElement.width);
  closeTo(initialWidget.height, initialElement.height);

  const bounds = await box(page.getByTestId('transform-bounds'));
  const dragStart = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 60, dragStart.y, { steps: 8 });
  await page.mouse.up();

  const draggedElement = await box(element);

  closeTo(draggedElement.x + draggedElement.width / 2 - (initialElement.x + initialElement.width / 2), 60);

  const eastBefore = await box(page.getByTestId('transform-handle-e'));
  const resizeStart = { x: eastBefore.x + eastBefore.width / 2, y: eastBefore.y + eastBefore.height / 2 };

  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x + 60, resizeStart.y, { steps: 8 });
  await page.mouse.up();

  const eastAfter = await box(page.getByTestId('transform-handle-e'));

  closeTo(eastAfter.x + eastAfter.width / 2 - resizeStart.x, 60);
});
