import { PropertiesSidebar } from '@broadset/ui';
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { createSidebarPanelFixtureElements } from '../../src/test-fixtures';
import { FIXTURE_IDS as PANEL_FIXTURE_IDS } from '../../src/test-fixtures/ids';
import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';
import { LayersHarness } from './panel-harnesses.helper';

function requireElementById(elementId: string) {
  const elements = createSidebarPanelFixtureElements();
  const element = elements[elementId];

  if (element === undefined) {
    throw new Error(`Missing sample element: ${elementId}`);
  }

  return element;
}

async function readScoreBugFillKind(page: Page): Promise<string | undefined> {
  return page.evaluate((): string | undefined => {
    type EditorStoreWindow = Window & {
      readonly __broadsetEditorStore?: {
        readonly getState: () => {
          readonly document: {
            readonly elements: readonly {
              readonly id: string;
              readonly style: { readonly fill: { readonly kind: string } };
            }[];
          };
        };
      };
    };

    const state = (window as EditorStoreWindow).__broadsetEditorStore?.getState();
    const element = state?.document.elements.find((entry) => entry.id === 'el-scorebug');

    return element?.style.fill.kind;
  });
}

async function readScoreBugOpacity(page: Page): Promise<number | undefined> {
  return page.evaluate((): number | undefined => {
    type EditorStoreWindow = Window & {
      readonly __broadsetEditorStore?: {
        readonly getState: () => {
          readonly document: {
            readonly elements: readonly {
              readonly id: string;
              readonly style: { readonly opacity: number };
            }[];
          };
        };
      };
    };

    const state = (window as EditorStoreWindow).__broadsetEditorStore?.getState();
    const element = state?.document.elements.find((entry) => entry.id === 'el-scorebug');

    return element?.style.opacity;
  });
}

async function readScoreBugRenderedOpacity(page: Page): Promise<string> {
  return page
    .locator(`[data-element-id="${FIXTURE_IDS.title}"] > [data-opacity-target]`)
    .evaluate((node) => getComputedStyle(node).opacity);
}

async function readScoreBugRenderedOpacityNumber(page: Page): Promise<number> {
  return Number(await readScoreBugRenderedOpacity(page));
}

async function enableExperimentalFeatures(page: Page): Promise<void> {
  await page.evaluate((): void => {
    interface ExperimentalStore {
      readonly getState: () => {
        readonly updateCanvasSettings: (settings: { showExperimentalFeatures: boolean }) => void;
      };
    }

    const store = (window as unknown as { readonly __broadsetEditorStore?: ExperimentalStore }).__broadsetEditorStore;

    store?.getState().updateCanvasSettings({ showExperimentalFeatures: true });
  });
}

async function seekTimelinePreview(page: Page, ratio: number): Promise<number> {
  const track = page.getByTestId('timeline-track');
  const bounds = await track.boundingBox();
  const durationAttribute = await track.getAttribute('data-duration-ms');
  const durationMs = durationAttribute !== null ? Number.parseInt(durationAttribute, 10) : 0;

  if (bounds === null) {
    throw new Error('Expected timeline track bounds');
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Expected timeline track duration');
  }

  await track.click({ position: { x: bounds.width * ratio, y: bounds.height / 2 } });

  return ratio;
}

async function readTimelinePlayheadRatio(page: Page): Promise<number> {
  const trackBox = await page.getByTestId('timeline-track').boundingBox();
  const playheadBox = await page.getByTestId('playhead').boundingBox();

  if (trackBox === null || playheadBox === null) {
    return 0;
  }

  return (playheadBox.x - trackBox.x) / trackBox.width;
}

async function dragTimelinePreviewToRatio(page: Page, ratio: number, shouldStartDrag: boolean): Promise<void> {
  const track = page.getByTestId('timeline-track');
  const trackBox = await track.boundingBox();

  if (trackBox === null) {
    throw new Error('Expected timeline track bounds');
  }

  const position = { x: trackBox.width * ratio, y: trackBox.height / 2 };

  await track.hover({ position });

  if (shouldStartDrag) {
    await page.mouse.down({ button: 'left' });
  }
}

async function finishTimelinePreviewDrag(page: Page): Promise<void> {
  await page.mouse.up({ button: 'left' });
}

/**
 * @description Validates `project/spec/demo/layout.md` + `project/spec/ui/panels.md`
 * P-01 shell behavior: no selection forces sidebar controls to Layers mode and
 * disables selection-dependent tabs.
 */
test('sidebar falls back to layers mode and disables selection tabs when selection clears', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await preview.dispatchEvent('click');

  // Properties tab is always visible and selection-dependent. The
  // Animation tab is experimental-gated and not visible by default,
  // so we don't assert it here — the experimental harnesses cover
  // that flow.
  await expect(page.locator('button[aria-label="Properties"]').first()).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-02: properties sidebar
 * renders the empty-state guidance when there is no selected element.
 */
test('PropertiesSidebar shows empty state message without selection', async ({ mount, page }) => {
  await mount(<PropertiesSidebar elements={[]} documentMode="screen" onUpdate={() => undefined} />);

  await expect(page.getByText('Select an element to edit its properties')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-03: panel ordering and
 * screen-mode conditional visibility; geometry and appearance sections are
 * ordered first.
 */
test('PropertiesSidebar applies section ordering in screen mode', async ({ mount, page }) => {
  const rectangle = requireElementById(PANEL_FIXTURE_IDS.title);

  await mount(<PropertiesSidebar elements={[rectangle]} documentMode="screen" onUpdate={() => undefined} />);

  const buttonTexts = await page.getByRole('region', { name: 'Properties' }).getByRole('button').allTextContents();
  const accordionOrder = buttonTexts
    .map((value) => value.trim())
    .filter((value) => ['Geometry', 'Appearance', 'Clip Path'].includes(value));

  expect(accordionOrder[0]).toBe('Geometry');
  expect(accordionOrder[1]).toBe('Appearance');
});

/**
 * @description Validates `project/spec/ui/panels.md` P-03 print-mode conditionals;
 * clip-path controls are hidden in print mode.
 */
test('PropertiesSidebar hides clip-path controls in print mode', async ({ mount, page }) => {
  const rectangle = requireElementById(PANEL_FIXTURE_IDS.title);

  await mount(<PropertiesSidebar elements={[rectangle]} documentMode="print" onUpdate={() => undefined} />);

  await expect(page.getByRole('button', { name: 'Clip Path' })).toHaveCount(0);
  await expect(page.getByLabel('CSS Gradient')).toHaveCount(0);
});

/**
 * @description Cross-region regression: editing the Appearance fill color in
 * the sidebar must update the canonical model fill and repaint the selected
 * canvas element. Previously the panel wrote a legacy backgroundColor field
 * that the renderer ignored.
 */
test('editing Appearance fill color updates the selected canvas element background', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const fillInput = page.getByLabel('Fill color color text');

  await fillInput.fill('#ff0000');
  await page.keyboard.press('Enter');

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] [data-element-content]`).first();

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe('rgb(255, 0, 0)');
});

/**
 * @description Cross-region regression: the Appearance opacity slider must
 * repaint the selected canvas element even when an animation timeline also
 * targets opacity. Previously the playback preview immediately wrote the
 * timeline's final opacity back over the edited base style.
 */
test('editing Appearance opacity updates the selected canvas element opacity', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const opacitySlider = page.getByRole('slider', { name: 'Opacity' });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  const scoreBugOpacityTarget = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] > [data-opacity-target]`);

  await expect.poll(async () => scoreBugOpacityTarget.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.5');
});

/**
 * @description Cross-region regression: layer edits must not let playback
 * restore animation-owned opacity over the selected root element's base
 * opacity. Repro: set Score Bug opacity to 50%, hide child Half Label, root
 * opacity must remain 50%.
 */
test('hiding a child layer preserves the parent element opacity edit', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const opacitySlider = page.getByRole('slider', { name: 'Opacity' });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  const scoreBugOpacityTarget = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] > [data-opacity-target]`);

  await expect.poll(async () => scoreBugOpacityTarget.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.5');

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Hide Half Label').click();

  await expect(page.getByLabel('Show Half Label')).toBeVisible();
  await expect.poll(async () => scoreBugOpacityTarget.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.5');
});

/**
 * @description Cross-region regression: timeline preview overlays are ephemeral.
 * After seeking an animation timeline, base Appearance and Layers edits must
 * still repaint the canvas from the durable document instead of restoring stale
 * animation-owned opacity.
 */
test('base opacity and child visibility edits stay stable after timeline preview seek', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await enableExperimentalFeatures(page);

  await page.getByRole('button', { name: 'Animation' }).click();
  await page.getByRole('button', { name: 'Timelines' }).click();
  await page.getByRole('button', { name: 'Edit Score Bug In' }).click();
  await expect(page.getByTestId('timeline-bottom-panel')).toHaveAttribute('aria-hidden', 'false');

  const expectedScrubRatio = await seekTimelinePreview(page, 0.1);

  await expect.poll(async () => readTimelinePlayheadRatio(page)).toBeGreaterThan(expectedScrubRatio - 0.02);
  expect(await readTimelinePlayheadRatio(page)).toBeLessThan(expectedScrubRatio + 0.02);

  await expect.poll(async () => readScoreBugRenderedOpacity(page)).not.toBe('1');

  const previewOpacityBeforeLayerEdit = await readScoreBugRenderedOpacity(page);
  const baseOpacityBeforeLayerEdit = await readScoreBugOpacity(page);

  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Hide Half Label').click();

  await expect(page.getByLabel('Show Half Label')).toBeVisible();
  await expect.poll(async () => readTimelinePlayheadRatio(page)).toBeGreaterThan(expectedScrubRatio - 0.02);
  expect(await readTimelinePlayheadRatio(page)).toBeLessThan(expectedScrubRatio + 0.02);
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe(previewOpacityBeforeLayerEdit);
  await expect.poll(async () => readScoreBugOpacity(page)).toBe(baseOpacityBeforeLayerEdit);

  await page.getByLabel('Show Half Label').click();
  await expect(page.getByLabel('Hide Half Label')).toBeVisible();

  await page.getByRole('button', { name: 'Properties' }).click();

  const opacitySlider = page.getByRole('slider', { name: 'Opacity' });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  await expect.poll(async () => readScoreBugOpacity(page)).toBe(0.3);
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe('0.3');

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Hide Half Label').click();

  await expect(page.getByLabel('Show Half Label')).toBeVisible();
  await expect.poll(async () => readScoreBugOpacity(page)).toBe(0.3);
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe('0.3');
});

/**
 * @description Cross-region regression: scrubbing the timeline track must
 * update the playhead and canvas preview immediately at pointer precision.
 * Keyframe drag remains grid-snapped, but preview scrubbing must not snap to
 * the 100ms edit grid.
 */
test('timeline scrub updates playhead and canvas opacity without grid snapping', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await enableExperimentalFeatures(page);

  await page.getByRole('button', { name: 'Animation' }).click();
  await page.getByRole('button', { name: 'Timelines' }).click();
  await page.getByRole('button', { name: 'Edit Score Bug In' }).click();
  await expect(page.getByTestId('timeline-bottom-panel')).toHaveAttribute('aria-hidden', 'false');

  const firstRatio = 0.173;
  const secondRatio = 0.427;

  await dragTimelinePreviewToRatio(page, firstRatio, true);
  await expect.poll(async () => readTimelinePlayheadRatio(page)).toBeGreaterThan(firstRatio - 0.015);
  expect(await readTimelinePlayheadRatio(page)).toBeLessThan(firstRatio + 0.015);
  await expect.poll(async () => readScoreBugRenderedOpacityNumber(page)).toBeGreaterThan(firstRatio - 0.015);
  expect(await readScoreBugRenderedOpacityNumber(page)).toBeLessThan(firstRatio + 0.015);

  await dragTimelinePreviewToRatio(page, secondRatio, false);
  await expect.poll(async () => readTimelinePlayheadRatio(page)).toBeGreaterThan(secondRatio - 0.015);
  expect(await readTimelinePlayheadRatio(page)).toBeLessThan(secondRatio + 0.015);
  await expect.poll(async () => readScoreBugRenderedOpacityNumber(page)).toBeGreaterThan(secondRatio - 0.015);
  expect(await readScoreBugRenderedOpacityNumber(page)).toBeLessThan(secondRatio + 0.015);

  await finishTimelinePreviewDrag(page);

  await page.waitForTimeout(100);
  await expect.poll(async () => readTimelinePlayheadRatio(page)).toBeGreaterThan(secondRatio - 0.015);
  expect(await readTimelinePlayheadRatio(page)).toBeLessThan(secondRatio + 0.015);
  await expect.poll(async () => readScoreBugRenderedOpacityNumber(page)).toBeGreaterThan(secondRatio - 0.015);
  expect(await readScoreBugRenderedOpacityNumber(page)).toBeLessThan(secondRatio + 0.015);
});

/**
 * @description Cross-region regression: switching a rectangle fill to
 * Gradient must write the canonical structured fill model and repaint the
 * canvas background image. The sidebar emits CSS-gradient strings, but the
 * renderer only consumes `style.fill.kind === "gradient"`.
 */
test('editing Appearance gradient updates the selected canvas element gradient fill', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.getByRole('button', { name: 'Gradient', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] [data-element-content]`).first();

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');

  await expect.poll(async () => readScoreBugFillKind(page)).toBe('gradient');
});

/**
 * @description Cross-region regression: after a timeline scrub, returning to
 * basic Appearance editing must clear timeline preview ownership before fill
 * controls write the durable model. Gradient edits should not flicker back to
 * a stale animation frame.
 */
test('editing Appearance gradient stays stable after timeline preview scrub', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await enableExperimentalFeatures(page);

  await page.getByRole('button', { name: 'Animation' }).click();
  await page.getByRole('button', { name: 'Timelines' }).click();
  await page.getByRole('button', { name: 'Edit Score Bug In' }).click();
  await expect(page.getByTestId('timeline-bottom-panel')).toHaveAttribute('aria-hidden', 'false');

  await seekTimelinePreview(page, 0.35);
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);

  await page.getByRole('button', { name: 'Properties' }).click();
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe('1');

  await page.getByRole('button', { name: 'Gradient', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] [data-element-content]`).first();

  await expect.poll(async () => readScoreBugFillKind(page)).toBe('gradient');
  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');

  await page.waitForTimeout(100);

  await expect.poll(async () => readScoreBugFillKind(page)).toBe('gradient');
  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');
});

/**
 * @description Cross-region regression: switching from Gradient back to Solid
 * must clear the structured gradient fill instead of re-applying the default
 * gradient through the empty-string backgroundGradient sentinel.
 */
test('switching Appearance fill from gradient back to solid clears the canvas gradient', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.getByRole('button', { name: 'Gradient', exact: true }).click();
  await page.getByRole('button', { name: 'Solid', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.title}"] [data-element-content]`).first();

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toBe('none');

  await expect.poll(async () => readScoreBugFillKind(page)).toBe('solid');
});

/**
 * @description Cross-region regression: nested child layer visibility toggles
 * must hide the child element independently from its parent group.
 */
test('LayersSidebar hides child elements independently from their parent', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Hide Half Label').click();

  await expect(page.locator(`[data-element-id="el-sb-half-label"]`)).toHaveCount(0);
  await expect(page.getByLabel('Show Half Label')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-04 mixed-selection affordance:
 * differing values across selected elements expose mixed-value UI marker.
 */
test('multi-selection with mixed values shows mixed indicator', async ({ mount, page }) => {
  const first = requireElementById(PANEL_FIXTURE_IDS.title);
  const baseSecond = requireElementById(PANEL_FIXTURE_IDS.logo);
  const second = {
    ...baseSecond,
    x: baseSecond.x + 120,
  };

  await mount(<PropertiesSidebar elements={[first, second]} documentMode="screen" onUpdate={() => undefined} />);

  const geometryTrigger = page.getByRole('button', { name: 'Geometry' });

  await geometryTrigger.click();
  await geometryTrigger.click();
  await expect(page.getByText('Multiple selection')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-06 inline rename behavior:
 * double-click enters rename mode, Enter commits, and Escape cancels.
 */
test('LayersSidebar inline rename supports commit and cancel keyboard paths', async ({ mount, page }) => {
  await mount(<LayersHarness />);

  const titleEntry = page.getByRole('button', { name: 'Select Title' });

  await titleEntry.dblclick();

  const renameInput = page.getByLabel('Rename layer');

  await renameInput.fill('Opening Title');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Select Opening Title' })).toBeVisible();

  await page.getByRole('button', { name: 'Select Badge' }).dblclick();
  await page.getByLabel('Rename layer').fill('Should Cancel');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Select Badge' })).toBeVisible();
  await expect(page.getByText('Should Cancel')).toHaveCount(0);
});

/**
 * @description Validates `project/spec/ui/panels.md` P-07 drag reorder semantics:
 * dragging one layer onto another updates list order in the rendered sidebar.
 */
test('LayersSidebar drag reorder updates visible layer order', async ({ mount, page }) => {
  await mount(<LayersHarness />);

  await expect(page.getByTestId('layers-order')).toHaveText('Title > Badge > Logo');

  await page.getByLabel('Drag Title').dragTo(page.getByLabel('Drag Logo'));

  await expect(page.getByTestId('layers-order')).toHaveText('Badge > Title > Logo');
});

/**
 * @description Validates `project/spec/ui/panels.md` P-08 visibility and lock
 * toggles mutate per-layer state and update button semantics.
 */
test('LayersSidebar toggles visibility and lock state per layer', async ({ mount, page }) => {
  await mount(<LayersHarness />);

  await page.getByLabel('Hide Badge').click();
  await page.getByLabel('Toggle lock Badge').click();

  await expect(page.getByLabel('Show Badge')).toBeVisible();
  await expect(page.getByTestId('layers-state')).toHaveText(/Badge:false:true/);
});

/**
 * @description Validates `project/spec/ui/panels.md` P-09 clip-path entrypoint:
 * selected element context menu exposes clip-path edit action.
 */
test('canvas context menu exposes clip-path edit action for selected element', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Expected preview bounding box for context-click');
  }

  await preview.click({
    button: 'right',
    force: true,
    position: {
      x: previewBox.width / 2,
      y: previewBox.height / 2,
    },
  });

  await expect(page.getByText('Edit clip path')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-10 type-specific sections:
 * video elements expose their corresponding panel controls.
 */
test('video type-specific panel exposes expected controls', async ({ mount, page }) => {
  await mount(
    <PropertiesSidebar
      elements={[requireElementById(PANEL_FIXTURE_IDS.video)]}
      documentMode="screen"
      onUpdate={() => undefined}
    />,
  );

  const videoTrigger = page.getByRole('button', { name: 'Video' });

  await expect(videoTrigger).toBeVisible();
  await videoTrigger.click();
  await expect(page.getByLabel('Source URL')).toBeVisible();
  await expect(page.getByLabel('Autoplay')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-10 type-specific sections:
 * clock elements expose their corresponding panel controls.
 */
test('clock type-specific panel exposes expected controls', async ({ mount, page }) => {
  await mount(
    <PropertiesSidebar
      elements={[requireElementById(PANEL_FIXTURE_IDS.clock)]}
      documentMode="screen"
      onUpdate={() => undefined}
    />,
  );

  const clockTrigger = page.getByRole('button', { name: 'Clock' });

  await expect(clockTrigger).toBeVisible();
  await clockTrigger.click();
  await expect(page.getByRole('textbox', { name: 'Format' })).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-10 type-specific sections:
 * ticker elements expose their corresponding panel controls.
 */
test('ticker type-specific panel exposes expected controls', async ({ mount, page }) => {
  await mount(
    <PropertiesSidebar
      elements={[requireElementById(PANEL_FIXTURE_IDS.ticker)]}
      documentMode="screen"
      onUpdate={() => undefined}
    />,
  );

  await page.getByRole('button', { name: /Ticker/i }).click({ force: true });
  await expect(page.getByLabel('Paused')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-11 accessibility contract:
 * accordion trigger reflects expanded state when section is toggled.
 */
test('properties accordion exposes aria-expanded state transitions', async ({ mount, page }) => {
  await mount(
    <PropertiesSidebar
      elements={[requireElementById(PANEL_FIXTURE_IDS.title)]}
      documentMode="screen"
      onUpdate={() => undefined}
    />,
  );

  const geometryTrigger = page.getByRole('button', { name: 'Geometry' });

  await expect(geometryTrigger).toHaveAttribute('aria-expanded', 'true');
  await geometryTrigger.click();
  await expect(geometryTrigger).toHaveAttribute('aria-expanded', 'false');
});
