import { expect, test } from '@playwright/experimental-ct-react';

import {
  GuidesHarness,
  InlineTextHarness,
  MarqueeSelectionHarness,
  SnapGuideHarness,
} from './advanced-harnesses.helper';

/**
 * @description Validates `project/spec/editor/canvas.md` C-03: marquee drag
 * selection highlights intersecting elements and renders accent fill + dashed border.
 */
test('marquee drag selects intersecting elements with required visual affordance', async ({ mount, page }) => {
  await mount(<MarqueeSelectionHarness />);

  const canvas = page.getByTestId('marquee-canvas');
  const box = await canvas.boundingBox();

  if (box === null) {
    throw new Error('Expected marquee canvas bounds');
  }

  const startX = box.x + 20;
  const startY = box.y + 20;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 260, startY + 170, { steps: 12 });

  const marqueeRect = page.getByTestId('marquee-rect');

  await expect(marqueeRect).toBeVisible();
  await expect(marqueeRect).toHaveCSS('border-style', 'dashed');
  await expect(marqueeRect).toHaveCSS('background-color', 'rgba(59, 130, 246, 0.2)');

  await page.mouse.up();

  await expect(page.getByTestId('marquee-selection')).toHaveText('el-a,el-b');
});

/**
 * @description Validates `project/spec/editor/canvas.md` C-14: dragging from
 * ruler creates a guide and dragging back into ruler area removes it.
 */
test('ruler drag creates guide and drag-back removes guide', async ({ mount, page }) => {
  await mount(<GuidesHarness />);

  const ruler = page.getByTestId('ruler-strip');
  const rulerBox = await ruler.boundingBox();

  if (rulerBox === null) {
    throw new Error('Expected ruler bounds');
  }

  const dragX = rulerBox.x + 100;
  const dragStartY = rulerBox.y + 14;

  await page.mouse.move(dragX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragX, dragStartY + 120, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('guide-count')).toHaveText('1');
  await expect(page.getByTestId('guide-line')).toBeVisible();

  const guideLine = page.getByTestId('guide-line');
  const guideBox = await guideLine.boundingBox();

  if (guideBox === null) {
    throw new Error('Expected guide line bounds');
  }

  await page.mouse.move(guideBox.x + 20, guideBox.y);
  await page.mouse.down();
  await page.mouse.move(dragX, dragStartY - 8, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId('guide-count')).toHaveText('0');
  await expect(page.getByTestId('guide-line')).toHaveCount(0);
});

/**
 * @description Validates `project/spec/editor/canvas.md` C-15: snap guide line
 * appears during alignment drag and disappears when drag ends.
 */
test('alignment drag shows snap guide line only during active drag', async ({ mount, page }) => {
  await mount(<SnapGuideHarness />);

  const moving = page.getByTestId('moving-node');
  const movingBox = await moving.boundingBox();

  if (movingBox === null) {
    throw new Error('Expected moving node bounds');
  }

  await page.mouse.move(movingBox.x + 20, movingBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(movingBox.x + 220, movingBox.y + 20, { steps: 15 });

  await expect(page.getByTestId('snap-guide-line')).toBeVisible();
  await expect(page.getByTestId('snap-visible')).toHaveText('true');

  await page.mouse.up();

  await expect(page.getByTestId('snap-guide-line')).toHaveCount(0);
  await expect(page.getByTestId('snap-visible')).toHaveText('false');
});

/**
 * @description Validates `project/spec/editor/canvas.md` C-16: inline text
 * editing opens on double-click, suppresses viewport actions while active,
 * Escape cancels, and blur commits edits.
 */
test('inline text editing supports open cancel commit and viewport suppression', async ({ mount, page }) => {
  await mount(<InlineTextHarness />);

  await page.getByTestId('inline-text-node').dblclick();
  await expect(page.getByTestId('inline-editing')).toHaveText('true');

  await page.getByTestId('inline-preview').dispatchEvent('wheel', { deltaY: 120 });
  await expect(page.getByTestId('inline-viewport-locked')).toHaveText('true');

  await page.getByTestId('inline-editor').press('Escape');
  await expect(page.getByTestId('inline-editing')).toHaveText('false');
  await expect(page.getByTestId('inline-text-value')).toHaveText('Headline');

  await page.getByTestId('inline-text-node').dblclick();
  await page.getByTestId('inline-editor').fill('Updated Headline');
  await page.getByTestId('inline-preview').click({ position: { x: 8, y: 8 } });

  await expect(page.getByTestId('inline-editing')).toHaveText('false');
  await expect(page.getByTestId('inline-text-value')).toHaveText('Updated Headline');
});
