import { PropertiesSidebar } from '@broadset/ui';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoAppFresh } from '../src/ct-demo-app';
import { LayersHarness } from '../src/ct-panel-harnesses';
import { toPanelElement } from '../src/demo-utils';
import { SAMPLE_DOCUMENT } from '../src/sampleDocument';

function requireElementById(elementId: string) {
  const element = SAMPLE_DOCUMENT.elements.find((candidate) => candidate.id === elementId);

  if (element === undefined) {
    throw new Error(`Missing sample element: ${elementId}`);
  }

  return toPanelElement(element);
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

  await expect(page.locator('button[aria-label="Properties"]').first()).toBeDisabled();
  await expect(page.locator('button[aria-label="Animation"]').first()).toBeDisabled();
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
 * screen-mode conditional visibility; clip-path controls are available in screen mode.
 */
test('PropertiesSidebar applies section ordering in screen mode', async ({ mount, page }) => {
  const rectangle = requireElementById('el-top-ribbon');

  await mount(<PropertiesSidebar elements={[rectangle]} documentMode="screen" onUpdate={() => undefined} />);

  const buttonTexts = await page.getByRole('region', { name: 'Properties' }).getByRole('button').allTextContents();
  const accordionOrder = buttonTexts
    .map((value) => value.trim())
    .filter((value) => ['Geometry', 'Appearance', 'Clip Path'].includes(value));

  expect(accordionOrder.slice(0, 3)).toEqual(['Geometry', 'Appearance', 'Clip Path']);
  await expect(page.getByLabel('CSS Gradient')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-03 print-mode conditionals;
 * clip-path controls are hidden in print mode.
 */
test('PropertiesSidebar hides clip-path controls in print mode', async ({ mount, page }) => {
  const rectangle = requireElementById('el-top-ribbon');

  await mount(<PropertiesSidebar elements={[rectangle]} documentMode="print" onUpdate={() => undefined} />);

  await expect(page.getByRole('button', { name: 'Clip Path' })).toHaveCount(0);
  await expect(page.getByLabel('CSS Gradient')).toHaveCount(0);
});

/**
 * @description Validates `project/spec/ui/panels.md` P-04 mixed-selection affordance:
 * differing values across selected elements expose mixed-value UI marker.
 */
test('multi-selection with mixed values shows mixed indicator', async ({ mount, page }) => {
  const first = requireElementById('el-top-ribbon');
  const second = requireElementById('el-sponsor-logo');

  await mount(<PropertiesSidebar elements={[first, second]} documentMode="screen" onUpdate={() => undefined} />);

  await expect(page.getByText('Mixed')).toBeVisible();
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

  await expect(page.getByTestId('layers-order')).toHaveText('Badge > Logo > Title');
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
      elements={[requireElementById('el-video-wall')]}
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
    <PropertiesSidebar elements={[requireElementById('el-clock')]} documentMode="screen" onUpdate={() => undefined} />,
  );

  const clockTrigger = page.getByRole('button', { name: 'Clock' });

  await expect(clockTrigger).toBeVisible();
  await clockTrigger.click();
  await expect(page.getByLabel('Format')).toBeVisible();
});

/**
 * @description Validates `project/spec/ui/panels.md` P-10 type-specific sections:
 * ticker elements expose their corresponding panel controls.
 */
test('ticker type-specific panel exposes expected controls', async ({ mount, page }) => {
  await mount(
    <PropertiesSidebar elements={[requireElementById('el-ticker')]} documentMode="screen" onUpdate={() => undefined} />,
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
      elements={[requireElementById('el-top-ribbon')]}
      documentMode="screen"
      onUpdate={() => undefined}
    />,
  );

  const geometryTrigger = page.getByRole('button', { name: 'Geometry' });

  await expect(geometryTrigger).toHaveAttribute('aria-expanded', 'true');
  await geometryTrigger.click();
  await expect(geometryTrigger).toHaveAttribute('aria-expanded', 'false');
});
