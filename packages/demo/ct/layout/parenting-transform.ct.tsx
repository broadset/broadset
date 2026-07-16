import type { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { createParentingTransformTestProjectV1 } from '../../src/test-fixtures';
import { FIXTURE_IDS as PARENTING_FIXTURE_IDS } from '../../src/test-fixtures/ids';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

function createParentPaddingFixture(): projectFormatV1.BroadsetProjectV1 {
  return createParentingTransformTestProjectV1();
}

/**
 * @description Validates `project/spec/model/format-reference.md` parent-relative coordinate semantics in browser geometry: child offsets must match local `position` even when parent has padding.
 */
test('parent padding does not shift parent-relative child geometry', async ({ mount, page }) => {
  await mount(<DemoAppStored project={createParentPaddingFixture()} />);

  const parent = page.locator(`[data-element-id="${PARENTING_FIXTURE_IDS.promoGroup}"]`);
  const child = page.locator(`[data-element-id="${PARENTING_FIXTURE_IDS.promoQr}"]`);

  await expect(parent).toBeVisible();
  await expect(child).toBeVisible();

  const result = await page.evaluate(
    ({ childId, parentId }) => {
      const parentNode = document.querySelector<HTMLElement>(`[data-element-id="${parentId}"]`);
      const childNode = document.querySelector<HTMLElement>(`[data-element-id="${childId}"]`);

      if (parentNode === null || childNode === null) {
        throw new Error('Expected parent and child nodes to exist');
      }

      const parentRect = parentNode.getBoundingClientRect();
      const childRect = childNode.getBoundingClientRect();
      const scaleX = parentNode.offsetWidth === 0 ? 1 : parentRect.width / parentNode.offsetWidth;
      const scaleY = parentNode.offsetHeight === 0 ? 1 : parentRect.height / parentNode.offsetHeight;
      const localTransform = new DOMMatrix(childNode.style.transform);
      const localX = localTransform.e;
      const localY = localTransform.f;
      const measuredX = childRect.left - parentRect.left;
      const measuredY = childRect.top - parentRect.top;

      return {
        localX,
        localY,
        measuredX,
        measuredY,
        expectedX: localX * scaleX,
        expectedY: localY * scaleY,
      };
    },
    {
      parentId: PARENTING_FIXTURE_IDS.promoGroup,
      childId: PARENTING_FIXTURE_IDS.promoQr,
    },
  );

  expect(result.localX).toBe(12);
  expect(result.localY).toBe(18);
  expect(Math.abs(result.measuredX - result.expectedX)).toBeLessThan(1.5);
  expect(Math.abs(result.measuredY - result.expectedY)).toBeLessThan(1.5);
});
