import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function openTab(page: Page, name: 'Animation' | 'Layers' | 'Properties'): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

async function selectLayer(page: Page, name: string): Promise<void> {
  await openTab(page, 'Layers');
  await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
}

/**
 * @description timeline.md "Timeline Bottom Panel": no active editing → aria-hidden;
 * open → TimelineEditor visible with tick readout. Regions: animation toolbar → timeline.
 */
test('open timeline shows the bottom panel and close hides it inert', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');

  const panel = page.getByTestId('timeline-bottom-panel');

  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: /open timeline/i }).click();
  await expect(panel).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('timeline-tick-readout')).toBeVisible();
  await page.getByRole('button', { name: 'Close timeline' }).click();
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
});

/**
 * @description timeline.md "Timeline Playback"/scrub: ruler pointer scrub seeks exact ticks
 * and the canvas preview updates. Regions: timeline → canvas.
 */
test('ruler scrub seeks exact ticks and drives the canvas preview', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await page.getByRole('button', { name: /open timeline/i }).click();

  const rail = page.getByTestId('timeline-ruler-rail');
  const box = await rail.boundingBox();

  if (box === null) throw new Error('rail not visible');
  await rail.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 1,
    clientX: box.x + box.width / 2,
    clientY: box.y + 4,
  });

  const tick = await page.evaluate(() => window.__broadsetProjectEditorStore?.getState().playbackTick);

  expect(tick).toBeGreaterThan(0);
  // Canvas region: the animated element's rendered opacity differs from tick 0.
  await expect
    .poll(() =>
      page
        .locator('[data-element-id]')
        .first()
        .evaluate((n) => getComputedStyle(n).opacity),
    )
    .not.toBe('');
});

/**
 * @description timeline.md "Add & select": add button creates a keyframe at the playhead on the
 * selected track and selects it. Regions: timeline → timeline + store (canvas preview source).
 */
test('add keyframe creates and selects a marker at the playhead tick', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await page.getByRole('button', { name: /open timeline/i }).click();

  const countKeyframes = () =>
    page.evaluate(
      () =>
        window.__broadsetProjectEditorStore?.getState().project.documents[0]?.sequences[0]?.tracks[0]?.keyframes
          .length ?? 0,
    );
  const before = await countKeyframes();

  // Select the first marker so the add-target track resolves, then move the playhead to a free tick.
  await page.locator('[data-testid^="timeline-marker-"]').first().click();
  await page.evaluate(() => window.__broadsetProjectEditorStore?.getState().seekPlaybackTick(37));
  await page.getByRole('button', { name: 'Add keyframe' }).click();
  await expect.poll(countKeyframes).toBe(before + 1);
});

/**
 * @description timeline.md "Keyframe Deletion": Delete removes the selected keyframe atomically
 * and undo restores it, scoped to the focused marker only — it MUST NOT bubble to the
 * workspace's global "delete selected canvas element" shortcut even though the canvas layer
 * remains selected throughout. Regions: timeline/keyboard → timeline + store (guards against
 * cross-region data loss: the canvas element must survive the keyframe delete).
 */
test('Delete removes the selected keyframe and undo restores it without deleting the selected canvas element', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await page.getByRole('button', { name: /open timeline/i }).click();

  const countKeyframes = () =>
    page.evaluate(
      () =>
        window.__broadsetProjectEditorStore?.getState().project.documents[0]?.sequences[0]?.tracks[0]?.keyframes
          .length ?? 0,
    );
  const countElements = () =>
    page.evaluate(() => window.__broadsetProjectEditorStore?.getState().project.documents[0]?.elements.length ?? 0);
  const keyframesBefore = await countKeyframes();
  const elementsBefore = await countElements();
  const marker = page.locator('[data-testid^="timeline-marker-"]').first();

  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  // The canvas layer selected via `selectLayer` above is intentionally left selected: this is
  // what regressed before the `event.stopPropagation()` fix in timeline-lanes.tsx.
  await marker.press('Delete');
  await expect.poll(countKeyframes).toBe(keyframesBefore - 1);
  // The still-selected canvas element must be untouched — the keydown must not have bubbled.
  await expect.poll(countElements).toBe(elementsBefore);
  await page.evaluate(() => window.__broadsetProjectEditorStore?.getState().undo());
  await expect.poll(countKeyframes).toBe(keyframesBefore);
  await expect.poll(countElements).toBe(elementsBefore);
});
