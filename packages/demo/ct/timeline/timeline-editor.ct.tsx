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

/** The 'Live Pulse' sequence's sole track ('Live Dot's opacity) has exactly these two keyframes. */
const FIRST_KEYFRAME_INDEX = 0;
const LAST_KEYFRAME_INDEX = 1;

/**
 * Reads an element's base (non-keyframe) opacity from the live store by its display name.
 * The sample document's only sequence ('Live Pulse') has a single track, owned by 'Live Dot'
 * (`sequences[0].tracks[0]`), so tests target that element to exercise the matching-entity path.
 */
function readElementBaseOpacity(page: Page, elementName: string): Promise<number | undefined> {
  return page.evaluate(
    (name) =>
      window.__broadsetProjectEditorStore
        ?.getState()
        .project.documents[0]?.elements.find((element) => element.name === name)?.appearance.opacity,
    elementName,
  );
}

function readTrackKeyframeValue(page: Page, keyframeIndex: number): Promise<unknown> {
  return page.evaluate(
    (index) =>
      window.__broadsetProjectEditorStore?.getState().project.documents[0]?.sequences[0]?.tracks[0]?.keyframes[index]
        ?.value,
    keyframeIndex,
  );
}

/**
 * @description panels.md "Property Editing Context for Keyframes": with a keyframe selected on
 * the SAME element as the current canvas selection, the Opacity field edits the keyframe's typed
 * value and that element's base appearance is unchanged. 'Live Dot' owns the sole track on the
 * default-previewed sequence ('Live Pulse'), so its canvas selection and the timeline's selected
 * keyframe agree on entity. Regions: timeline → properties panel → store.
 */
test('opacity edits route to the selected keyframe when it belongs to the selected element', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Live Dot');
  await page.getByRole('button', { name: /open timeline/i }).click();
  await page.locator('[data-testid^="timeline-marker-"]').first().click();
  await openTab(page, 'Properties');
  await expect(page.getByTestId('keyframe-mode-banner')).toBeVisible();

  const baseBefore = await readElementBaseOpacity(page, 'Live Dot');
  const slider = page.getByRole('slider', { name: /opacity/i });

  await slider.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => readTrackKeyframeValue(page, FIRST_KEYFRAME_INDEX)).toEqual({ type: 'number', value: 0 });
  expect(await readElementBaseOpacity(page, 'Live Dot')).toBe(baseBefore);
});

/**
 * @description panels.md "Property Editing Context for Keyframes": timeline keyframe selection
 * is independent of canvas selection, and the timeline shows all tracks regardless of which
 * element is selected on canvas. Regression coverage for the C1 entity-identity bug: with the
 * keyframe on 'Live Dot's track selected on the timeline, selecting the DIFFERENT layer
 * 'Score Bug' and editing ITS Opacity must fall through to the normal element-update path — it
 * must not silently write to 'Live Dot's keyframe, and the keyframe-mode banner must not lie
 * about being in keyframe-editing mode for 'Score Bug'. Selects the track's LAST keyframe
 * (tick 800) deliberately: it has no `interpolation`, so the easing graph never mounts — the
 * easing graph's own outside-mousedown-closes-selection behavior would otherwise clear the
 * timeline selection the moment the "Select Score Bug" layer button is clicked, masking the
 * entity-identity bug this test exists to catch. Regions: timeline → layers panel → properties
 * panel → store.
 */
test('opacity edits fall through to the base element when the selected keyframe belongs to a different element', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Live Dot');
  await page.getByRole('button', { name: /open timeline/i }).click();

  const marker = page.locator('[data-testid^="timeline-marker-"]').last();

  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');

  // Select a DIFFERENT layer on canvas while 'Live Dot's keyframe stays selected on the timeline.
  await selectLayer(page, 'Score Bug');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await openTab(page, 'Properties');
  await expect(page.getByTestId('keyframe-mode-banner')).not.toBeVisible();

  const scoreBugBaseBefore = await readElementBaseOpacity(page, 'Score Bug');
  const liveDotKeyframeBefore = await readTrackKeyframeValue(page, LAST_KEYFRAME_INDEX);

  expect(scoreBugBaseBefore).not.toBe(0);

  // 'Score Bug' is a Group element, so its opacity slider is labeled 'Group opacity' rather than
  // the plain 'Opacity' label used by non-group panels — both call onUpdate('opacity', ...).
  const slider = page.getByRole('slider', { name: /opacity/i });

  await slider.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => readElementBaseOpacity(page, 'Score Bug')).toBe(0);
  expect(await readTrackKeyframeValue(page, LAST_KEYFRAME_INDEX)).toEqual(liveDotKeyframeBefore);
  await expect(page.getByTestId('keyframe-mode-banner')).not.toBeVisible();
});

/**
 * @description timeline.md "Timeline Bottom Panel" / panels.md "Property Editing Context for
 * Keyframes": a mousedown outside the easing graph editor closes ONLY the graph — it must not
 * clear the timeline's selected keyframe. Regression coverage for the easing-graph
 * selection-coupling bug: `onCloseEasing` used to be wired to the same handler that clears
 * `selectedTimelineKeyframe`, so any native `mousedown` reaching `EasingGraphEditor`'s
 * document-level outside-click listener would drop the keyframe-property routing mid-edit. The
 * existing "opacity edits route to the selected keyframe" test above never exercises this path
 * because it edits the slider via `.focus()` + keyboard alone, which never dispatches a
 * `mousedown`. This test dispatches a genuine `mousedown` directly on the Opacity slider (react-
 * aria's raw `useSlider` track handler does not `stopPropagation()` the way HeroUI's press-driven
 * Button/Tab controls do — verified separately: switching sidebar tabs, which IS press-driven,
 * leaves the graph open) at the slider's OWN current thumb position, so the mousedown's incidental
 * track-click-to-value jump is a no-op and cannot itself account for a subsequent value change —
 * only the deliberate `.focus()` + keyboard edit that follows can. Selects the FIRST 'Live Dot'
 * opacity keyframe (tick 0) deliberately: it has an outgoing cubic-bezier interpolation, so the
 * easing graph mounts — the LAST keyframe (used by the entity-identity test below) has no
 * interpolation and never mounts the graph, so it cannot exercise this path. Regions: timeline →
 * properties panel → store.
 */
test('a real mousedown on the Opacity slider while an eased keyframe is selected still routes the edit to the keyframe', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Live Dot');
  await page.getByRole('button', { name: /open timeline/i }).click();

  const marker = page.locator('[data-testid^="timeline-marker-"]').first();

  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('easing-graph-editor')).toBeVisible();

  await openTab(page, 'Properties');
  await expect(page.getByTestId('keyframe-mode-banner')).toBeVisible();
  // Switching sidebar tabs is press-driven (HeroUI Tab -> react-aria usePress, which stops
  // propagation of the underlying native mousedown), so it does not reach the graph's
  // outside-click listener — the graph is still open here, ready for the real trigger below.
  await expect(page.getByTestId('easing-graph-editor')).toBeVisible();

  const baseBefore = await readElementBaseOpacity(page, 'Live Dot');
  const keyframeBefore = await readTrackKeyframeValue(page, FIRST_KEYFRAME_INDEX);
  const opacitySlider = page.getByRole('slider', { name: /opacity/i });
  const opacityTrack = page.locator('[data-slot="slider-track"]').filter({ has: opacitySlider });
  const trackBox = await opacityTrack.boundingBox();

  if (trackBox === null) throw new Error('opacity slider track not visible');

  // Genuine mousedown at the track's right edge — matching the keyframe's current 100% value —
  // so this event cannot itself move the slider; it exists solely to reproduce a real `mousedown`
  // landing on the Opacity slider while the graph is open.
  await opacitySlider.dispatchEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: trackBox.x + trackBox.width,
    clientY: trackBox.y,
  });

  // The genuine mousedown above closed the graph (proving the listener fired)...
  await expect(page.getByTestId('easing-graph-editor')).not.toBeVisible();
  // ...and did not perturb the value on its own.
  expect(await readTrackKeyframeValue(page, FIRST_KEYFRAME_INDEX)).toEqual(keyframeBefore);
  expect(await readElementBaseOpacity(page, 'Live Dot')).toBe(baseBefore);

  // The actual edit: focus + keyboard, exercising property-panel routing with the graph now
  // closed but the keyframe selection (post-fix) still intact.
  await opacitySlider.focus();
  await page.keyboard.press('Home');

  // The edit landed on the keyframe, not on 'Live Dot's base opacity — the selection, and
  // therefore the property-panel routing, survived the graph-closing mousedown.
  await expect.poll(() => readTrackKeyframeValue(page, FIRST_KEYFRAME_INDEX)).not.toEqual(keyframeBefore);
  expect(await readElementBaseOpacity(page, 'Live Dot')).toBe(baseBefore);
  await expect(page.getByTestId('keyframe-mode-banner')).toBeVisible();
});

/**
 * @description timeline.md "Lifecycle and State-Machine Authoring": the friendly modifier toggle
 * compiles to a canonical two-state machine. Regions: properties/animation panel → store.
 */
test('adding a modifier authors a canonical two-state machine', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await openTab(page, 'Animation');
  await page.getByRole('textbox', { name: 'New modifier name' }).fill('Flash');
  await page.getByRole('button', { name: 'Add modifier' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const machines = window.__broadsetProjectEditorStore?.getState().project.documents[0]?.stateMachines ?? [];

        return machines.map((machine) => machine.states.map(({ name }) => name));
      }),
    )
    .toContainEqual(['inactive', 'active']);
});
