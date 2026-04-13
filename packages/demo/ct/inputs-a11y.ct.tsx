import { expect, test } from '@playwright/experimental-ct-react';

import {
  ColorInputHarness,
  CssLengthHarness,
  FilterHarness,
  NumFieldHarness,
  ShadowHarness,
} from '../src/ct-input-harnesses';

/**
 * @description Validates `project/spec/ui/inputs.md` I-01: ColorInput text draft
 * keeps invalid input local (`aria-invalid`) and reverts on blur, while valid rgba
 * commits to the canonical hexa value.
 */
test('ColorInput supports draft validation and commit semantics', async ({ mount, page }) => {
  await mount(<ColorInputHarness initialValue="#ff0000" />);

  const input = page.getByLabel('Fill color text');

  await input.fill('not-a-color');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.blur();

  await expect(page.getByTestId('color-value')).toHaveText('#ff0000');

  await input.fill('rgba(255, 0, 0, 0.5)');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('color-value')).toHaveText('#ff000080');
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-01 transparency contract:
 * fully transparent values expose the checkerboard semantics on the color swatch.
 */
test('ColorInput transparent swatch is exposed through data semantics', async ({ mount, page }) => {
  await mount(<ColorInputHarness initialValue="rgba(0,0,0,0)" />);

  await expect(page.getByTestId('color-swatch')).toHaveAttribute('data-transparent', 'true');
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-02: NumField commits on
 * blur/Enter, arrow keys commit immediately, and invalid text reverts to last valid.
 */
test('NumField commit timing follows blur, enter, and arrow-key semantics', async ({ mount, page }) => {
  await mount(<NumFieldHarness />);

  const input = page.getByRole('textbox', { name: 'X' });
  const increaseButton = page.getByRole('button', { name: 'Increase X' });

  await increaseButton.click();
  await input.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('num-value')).toHaveText('11');

  await input.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('num-value')).toHaveText('12');

  await input.fill('abc');
  await input.blur();
  await expect(page.getByTestId('num-value')).toHaveText('12');
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-03: CssLengthInput unit
 * switch converts compatible units and emits values in the selected target unit.
 */
test('CssLengthInput converts values when unit changes', async ({ mount, page }) => {
  await mount(<CssLengthHarness />);

  await expect(page.getByTestId('length-value')).toHaveText('96px');

  await page.getByRole('button', { name: /unit/i }).click();
  await page.getByRole('option', { name: 'in' }).click();

  await expect(page.getByTestId('length-value')).toHaveText('1in');
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-04: FilterEditor supports
 * add/remove/reorder operations, prevents duplicates in add options, and preserves
 * emitted filter-string order.
 */
test('FilterEditor supports stack add, reorder, and remove without duplicates', async ({ mount, page }) => {
  await mount(<FilterHarness />);

  await page.getByRole('button', { name: /add filter/i }).click();
  await page.getByRole('option', { name: 'blur' }).click();
  await expect(page.getByTestId('filter-value')).toHaveText(/blur\(/);

  await page.getByRole('button', { name: /add filter/i }).click();
  await page.getByRole('option', { name: 'contrast' }).click();
  await expect(page.getByTestId('filter-value')).toHaveText(/blur\(.*contrast\(/);

  await page.getByRole('button', { name: /add filter/i }).click();
  await expect(page.getByRole('option', { name: 'blur' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByLabel('Move contrast up').click();
  await expect(page.getByTestId('filter-value')).toHaveText(/^contrast\(.*blur\(/);

  await page.getByLabel('Remove contrast').click();
  await expect(page.getByTestId('filter-value')).toHaveText(/^blur\(/);
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-05: ShadowEditor toggling
 * emits `none` when disabled, restores previous layers when re-enabled, and
 * keeps multi-layer output valid after adding/removing layers.
 */
test('ShadowEditor toggle and layer operations preserve valid output', async ({ mount, page }) => {
  await mount(<ShadowHarness />);

  await expect(page.getByTestId('shadow-value')).not.toHaveText('none');

  const shadowToggle = page.getByRole('switch', { name: 'Enable shadow' });

  await shadowToggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('shadow-value')).toHaveText('none');

  await shadowToggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('shadow-value')).not.toHaveText('none');

  await page.getByLabel('Add shadow layer').click();
  await expect(page.getByTestId('shadow-layer')).toHaveCount(2);

  await page.getByLabel('Remove layer 2').click();
  await expect(page.getByTestId('shadow-layer')).toHaveCount(1);
});

/**
 * @description Validates `project/spec/ui/inputs.md` I-06 accessibility rules:
 * labels are wired, invalid states expose `aria-invalid`, and slider controls
 * are keyboard reachable by role/label.
 */
test('input components expose accessible labels and invalid semantics', async ({ mount, page }) => {
  await mount(
    <div>
      <ColorInputHarness initialValue="#00ff00" />
      <ShadowHarness />
    </div>,
  );

  await expect(page.getByLabel('Fill color text')).toBeVisible();
  await expect(page.getByLabel('Enable shadow')).toBeVisible();

  const colorInput = page.getByLabel('Fill color text');

  await colorInput.fill('oops');
  await expect(colorInput).toHaveAttribute('aria-invalid', 'true');

  // Blur slider supports keyboard focus through role semantics.
  const blurSlider = page.getByRole('slider', { name: 'Blur' }).first();

  await expect(blurSlider).toBeVisible();
  await blurSlider.focus();
  await page.keyboard.press('ArrowRight');
});
