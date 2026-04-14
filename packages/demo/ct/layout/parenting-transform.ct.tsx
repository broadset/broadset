import type { BroadsetDocument } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { createParentingTransformTestDocument } from '../../src/test-fixtures';
import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

function createParentPaddingFixture(): BroadsetDocument {
  return createParentingTransformTestDocument();
}

/**
 * @description Validates `project/spec/model/format-reference.md` parent-relative coordinate semantics in browser geometry: child offsets must match local `position` even when parent has padding.
 */
test('parent padding does not shift parent-relative child geometry', async ({ mount, page }) => {
  await mount(<DemoAppStored document={createParentPaddingFixture()} />);

  const parent = page.locator(`[data-element-id="${FIXTURE_IDS.promoGroup}"]`);
  const child = page.locator(`[data-element-id="${FIXTURE_IDS.promoQr}"]`);

  await expect(parent).toBeVisible();
  await expect(child).toBeVisible();

  const result = await page.evaluate(
    ({ childId, parentId }) => {
      const parentNode = document.querySelector<HTMLElement>(`[data-element-id="${parentId}"]`);
      const childNode = document.querySelector<HTMLElement>(`[data-element-id="${childId}"]`);

      if (parentNode === null || childNode === null) {
        throw new Error('Expected parent and child nodes to exist');
      }

      const parentContent = parentNode.querySelector<HTMLElement>(':scope > [data-opacity-target] > div');

      if (parentContent === null) {
        throw new Error('Expected parent content host to exist');
      }

      const parentRect = parentNode.getBoundingClientRect();
      const childRect = childNode.getBoundingClientRect();
      const scaleX = parentNode.offsetWidth === 0 ? 1 : parentRect.width / parentNode.offsetWidth;
      const scaleY = parentNode.offsetHeight === 0 ? 1 : parentRect.height / parentNode.offsetHeight;
      const localX = Number.parseFloat(childNode.style.left);
      const localY = Number.parseFloat(childNode.style.top);
      const measuredX = childRect.left - parentRect.left;
      const measuredY = childRect.top - parentRect.top;

      return {
        localX,
        localY,
        measuredX,
        measuredY,
        expectedX: localX * scaleX,
        expectedY: localY * scaleY,
        parentContentPadding: parentContent.style.padding,
      };
    },
    {
      parentId: FIXTURE_IDS.promoGroup,
      childId: FIXTURE_IDS.promoQr,
    },
  );

  expect(result.localX).toBe(12);
  expect(result.localY).toBe(18);
  expect(result.parentContentPadding).toBe('0px');
  expect(Math.abs(result.measuredX - result.expectedX)).toBeLessThan(1.5);
  expect(Math.abs(result.measuredY - result.expectedY)).toBeLessThan(1.5);
});
