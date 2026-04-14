import { expect, test } from '@playwright/experimental-ct-react';

import {
  BindingHarness,
  EasingGraphHarness,
  PropertyLanesHarness,
  TimelineHarness,
  TimelinePanelHarness,
} from './timeline-harnesses.helper';

/**
 * @description Validates `project/spec/ui/timeline.md` L-01: Timeline bottom panel
 * opens with content and closes via header close action while preserving hidden state.
 */
test('Timeline bottom panel open/close behavior is reflected in panel state', async ({ mount, page }) => {
  await mount(<TimelinePanelHarness />);

  await expect(page.getByTestId('timeline-bottom-panel')).toHaveAttribute('aria-hidden', 'false');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByTestId('timeline-bottom-panel')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('timeline-panel-open')).toHaveText('false');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-02: adding a keyframe
 * auto-selects it, and marker selection remains single-select via `aria-pressed`.
 */
test('TimelineEditor add/select keeps single selected keyframe semantics', async ({ mount, page }) => {
  await mount(<TimelineHarness />);

  await expect(page.getByTestId('keyframe-marker')).toHaveCount(2);

  await page.getByRole('button', { name: 'Add keyframe' }).click();
  await expect(page.getByTestId('keyframe-marker')).toHaveCount(3);
  await expect(page.getByTestId('timeline-selected')).toHaveText('2');

  await page.getByTestId('keyframe-marker').first().click();
  await expect(page.getByTestId('timeline-selected')).toHaveText('0');
  await expect(page.locator('[data-testid="keyframe-marker"][aria-pressed="true"]')).toHaveCount(1);
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-03: keyframe marker drag
 * commits a new snapped offset and updates timeline seek output.
 */
test('dragging a keyframe marker commits a new offset', async ({ mount, page }) => {
  await mount(<TimelineHarness />);

  const marker = page.getByTestId('keyframe-marker').nth(1);
  const markerBox = await marker.boundingBox();

  if (markerBox === null) {
    throw new Error('Expected second keyframe marker bounding box');
  }

  const startX = markerBox.x + markerBox.width / 2;
  const startY = markerBox.y + markerBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 110, startY, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('timeline-offsets')).not.toHaveText('0,1200');
  await expect(page.getByTestId('timeline-time')).not.toHaveText('0');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-04: timeline playback
 * controls switch between play and pause/stop states and update runtime state.
 */
test('playback controls toggle play and stop states', async ({ mount, page }) => {
  await mount(<TimelineHarness />);

  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByTestId('timeline-playing')).toHaveText('true');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByTestId('timeline-playing')).toHaveText('false');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-06: animation binding
 * sections support add/remove operations for both state and modifier bindings.
 */
test('AnimationBindingSections add and remove state/modifier bindings', async ({ mount, page }) => {
  await mount(<BindingHarness />);

  await expect(page.getByTestId('binding-state-count')).toHaveText('2');
  await expect(page.getByTestId('binding-modifier-count')).toHaveText('1');

  await page.getByRole('button', { name: 'Add state' }).click();
  await expect(page.getByTestId('binding-state-count')).toHaveText('3');

  await page.getByRole('button', { name: 'Add modifier' }).click();
  await expect(page.getByTestId('binding-modifier-count')).toHaveText('2');

  await page
    .getByRole('button', { name: /Remove modifier-/ })
    .first()
    .click();
  await expect(page.getByTestId('binding-modifier-count')).toHaveText('1');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-08: easing graph preset
 * chips update easing immediately, bezier handles are interactive, and outside
 * click closes the editor.
 */
test('Easing graph supports presets, handle drag, and outside-click close', async ({ mount, page }) => {
  await mount(<EasingGraphHarness />);

  const handle = page.getByTestId('bezier-handle').first();
  const handleBox = await handle.boundingBox();

  if (handleBox === null) {
    throw new Error('Expected bezier handle bounding box');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 18, startY - 14, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('easing-value')).toHaveText(/cubic-bezier\(/);

  await page.getByRole('button', { name: 'linear' }).click();
  await expect(page.getByTestId('easing-value')).toHaveText('linear');

  const editorBox = await page.getByTestId('easing-graph-editor').boundingBox();

  if (editorBox === null) {
    throw new Error('Expected easing graph editor bounding box');
  }

  await page.mouse.click(editorBox.x + editorBox.width + 24, editorBox.y + 8);
  await expect(page.getByTestId('easing-closed')).toHaveText('true');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-09: per-property lanes
 * create keyframes on double-click and support independent per-property drag.
 */
test('Per-property lanes support add-on-double-click and marker drag', async ({ mount, page }) => {
  await mount(<PropertyLanesHarness />);

  await expect(page.getByTestId('lanes-keyframe-count')).toHaveText('2');

  const xLane = page.getByTestId('property-lane').filter({ hasText: 'x' }).first();
  const laneBox = await xLane.boundingBox();

  if (laneBox === null) {
    throw new Error('Expected x property lane bounding box');
  }

  await xLane.dblclick({ position: { x: laneBox.width * 0.5, y: laneBox.height * 0.5 } });
  await expect(page.getByTestId('lanes-keyframe-count')).toHaveText('3');

  const marker = page.getByTestId('property-keyframe-marker').first();
  const markerBox = await marker.boundingBox();

  if (markerBox === null) {
    throw new Error('Expected property marker bounding box');
  }

  const startX = markerBox.x + markerBox.width / 2;
  const startY = markerBox.y + markerBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('lanes-offsets')).not.toHaveText('0,1200');
});
