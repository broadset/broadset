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

async function readFillKind(page: Page, elementId: string): Promise<string | undefined> {
  return page.evaluate((id): string | undefined => {
    const state = window.__broadsetProjectEditorStore?.getState();
    const element = state?.project.documents[0]?.elements.find((entry) => entry.id === id);

    return element?.appearance.fills[0]?.paint.kind;
  }, elementId);
}

async function readScoreBugOpacity(page: Page): Promise<number | undefined> {
  return page.evaluate((): number | undefined => {
    const state = window.__broadsetProjectEditorStore?.getState();
    const element = state?.project.documents[0]?.elements.find((entry) => entry.id === 'el-scorebug');

    return element?.appearance.opacity;
  });
}

async function readScoreBugRenderedOpacity(page: Page): Promise<string> {
  return page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`).evaluate((node) => getComputedStyle(node).opacity);
}

async function openTab(page: Page, name: 'Animation' | 'Layers' | 'Properties'): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

async function selectLayer(page: Page, name: string): Promise<void> {
  await openTab(page, 'Layers');
  await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
}

async function openScoreBugProperties(page: Page): Promise<void> {
  await selectLayer(page, 'Score Bug');
  await openTab(page, 'Properties');

  const appearance = page.getByRole('button', { name: 'Appearance', exact: true });

  if ((await appearance.getAttribute('aria-expanded')) !== 'true') await appearance.click();
}

/**
 * @description Validates `project/spec/demo/layout.md` + `project/spec/ui/panels.md`
 * P-01 shell behavior: no selection forces sidebar controls to Layers mode and
 * disables selection-dependent tabs.
 */
test('sidebar falls back to layers mode and disables selection tabs when selection clears', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.evaluate(() => {
    window.__broadsetProjectEditorStore?.getState().setActiveElements([]);
  });

  // Properties tab is always visible and selection-dependent. The
  // Animation tab is experimental-gated and not visible by default,
  // so we don't assert it here — the experimental harnesses cover
  // that flow.
  await expect(page.getByRole('tab', { name: 'Properties' })).toBeDisabled();
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
  await openScoreBugProperties(page);

  const fillInput = page.getByLabel('Fill color color text');

  await fillInput.fill('#ff0000');
  await page.keyboard.press('Enter');

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`);

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('color(srgb 1 0 0)');
});

/**
 * @description Cross-region regression: the Appearance opacity slider must
 * repaint the selected canvas element even when an animation timeline also
 * targets opacity. Previously the playback preview immediately wrote the
 * timeline's final opacity back over the edited base style.
 */
test('editing Appearance opacity updates the selected canvas element opacity', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await openScoreBugProperties(page);

  const opacitySlider = page.getByRole('slider', { name: 'Opacity', exact: true });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  const scoreBugOpacityTarget = page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`);

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
  await openScoreBugProperties(page);

  const opacitySlider = page.getByRole('slider', { name: 'Opacity', exact: true });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  const scoreBugOpacityTarget = page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`);

  await expect.poll(async () => scoreBugOpacityTarget.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.5');

  await openTab(page, 'Layers');
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
test('base opacity and child visibility edits stay stable after a v1 sequence edit', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await openTab(page, 'Animation');
  await page.getByRole('spinbutton', { name: 'Duration ticks' }).fill('901');

  await openTab(page, 'Layers');
  await page.getByLabel('Hide Half Label').click();
  await expect(page.getByLabel('Show Half Label')).toBeVisible();

  await openTab(page, 'Properties');

  const appearance = page.getByRole('button', { name: 'Appearance', exact: true });

  if ((await appearance.getAttribute('aria-expanded')) !== 'true') await appearance.click();

  const opacitySlider = page.getByRole('slider', { name: 'Opacity', exact: true });

  await opacitySlider.focus();
  await page.keyboard.press('Home');

  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('ArrowRight');
  }

  await expect.poll(async () => readScoreBugOpacity(page)).toBe(0.3);
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe('0.3');
  await expect(page.locator('[data-element-id="el-sb-half-label"]')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.__broadsetProjectEditorStore?.getState();
        const document = state?.project.documents[0];
        const pageState = document?.pages.find(({ id }) => id === state?.activePageId);

        return (document?.sequences.find(({ id }) => id === pageState?.sequenceId) ?? document?.sequences[0])
          ?.durationTicks;
      }),
    )
    .toBe(901);
});

/**
 * @description Cross-region regression: scrubbing the timeline track must
 * update the playhead and canvas preview immediately at pointer precision.
 * Keyframe drag remains grid-snapped, but preview scrubbing must not snap to
 * the 100ms edit grid.
 */
test('animation sidebar updates canonical v1 keyframe ticks without changing base opacity', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await openTab(page, 'Animation');

  const keyframeInput = page.getByRole('spinbutton', { name: /keyframe 1 tick/i }).first();

  await keyframeInput.fill('173');
  await expect(keyframeInput).toHaveValue('173');
  await expect.poll(async () => readScoreBugRenderedOpacity(page)).toBe('1');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.__broadsetProjectEditorStore?.getState();
        const document = state?.project.documents[0];
        const pageState = document?.pages.find(({ id }) => id === state?.activePageId);

        return (document?.sequences.find(({ id }) => id === pageState?.sequenceId) ?? document?.sequences[0])?.tracks[0]
          ?.keyframes[0]?.tick;
      }),
    )
    .toBe(173);
});

/**
 * @description Cross-region regression: switching a rectangle fill to
 * Gradient must write the canonical structured fill model and repaint the
 * canvas background image. The sidebar emits CSS-gradient strings, but the
 * renderer only consumes `style.fill.kind === "gradient"`.
 */
test('editing Appearance gradient updates the selected canvas element gradient fill', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Top Vignette');
  await page.getByLabel('Toggle lock Top Vignette').click();
  await openTab(page, 'Properties');

  await page.getByRole('button', { name: 'Solid', exact: true }).click();
  await page.getByRole('button', { name: 'Gradient', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.background}"]`);

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');

  await expect.poll(async () => readFillKind(page, FIXTURE_IDS.background)).toBe('gradient');
});

/**
 * @description Cross-region regression: after a timeline scrub, returning to
 * basic Appearance editing must clear timeline preview ownership before fill
 * controls write the durable model. Gradient edits should not flicker back to
 * a stale animation frame.
 */
test('editing Appearance gradient stays stable after a v1 sequence edit', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');
  await openTab(page, 'Animation');
  await page.getByRole('spinbutton', { name: 'Duration ticks' }).fill('902');
  await selectLayer(page, 'Top Vignette');
  await page.getByLabel('Toggle lock Top Vignette').click();
  await openTab(page, 'Properties');

  await page.getByRole('button', { name: 'Solid', exact: true }).click();
  await page.getByRole('button', { name: 'Gradient', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.background}"]`);

  await expect.poll(async () => readFillKind(page, FIXTURE_IDS.background)).toBe('gradient');
  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');

  await expect.poll(async () => readFillKind(page, FIXTURE_IDS.background)).toBe('gradient');
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
  await selectLayer(page, 'Top Vignette');
  await page.getByLabel('Toggle lock Top Vignette').click();
  await openTab(page, 'Properties');

  await page.getByRole('button', { name: 'Gradient', exact: true }).click();
  await page.getByRole('button', { name: 'Solid', exact: true }).click();

  const scoreBugContent = page.locator(`[data-element-id="${FIXTURE_IDS.background}"]`);

  await expect
    .poll(async () => scoreBugContent.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain('linear-gradient');

  await expect.poll(async () => readFillKind(page, FIXTURE_IDS.background)).toBe('solid');
});

/**
 * @description Cross-region regression: nested child layer visibility toggles
 * must hide the child element independently from its parent group.
 */
test('LayersSidebar hides child elements independently from their parent', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await openTab(page, 'Layers');
  await page.getByLabel('Hide Half Label').click();

  await expect(page.locator(`[data-element-id="el-sb-half-label"]`)).toBeHidden();
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
 * @description Validates the v1 selected-element context menu entrypoint.
 */
test('canvas context menu exposes v1 actions for the selected element', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await selectLayer(page, 'Score Bug');

  const preview = page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`);
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

  await expect(page.getByText('Copy')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Lock' })).toBeVisible();
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
