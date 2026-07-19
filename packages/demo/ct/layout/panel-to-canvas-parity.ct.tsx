import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS } from '../fixture-selectors';

async function openLayers(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Layers' }).click();
}

async function openProperties(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Properties' }).click();
}

async function selectLayer(page: Page, label: string): Promise<void> {
  await openLayers(page);
  await page.getByRole('button', { name: `Select ${label}`, exact: true }).click();
}

async function expandAccordion(page: Page, label: string): Promise<void> {
  const trigger = page.getByRole('button', { name: label, exact: true }).first();
  const expanded = (await trigger.getAttribute('aria-expanded')) === 'true';

  if (!expanded) await trigger.click();
}

/**
 * @description Validates the end-to-end panel-to-canvas parity contract: an edit
 * made in the Properties panel for a selected element must propagate to the
 * rendered canvas element's computed CSS. This covers the object-fit flow — the
 * exemplar for TI-3.2 panel interaction parity, using a flow whose effect is
 * directly observable on the canvas image's computed style.
 */
test('changing object-fit in the properties panel updates the canvas image CSS', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await selectLayer(page, 'Network Bug');
  await openProperties(page);

  const objectFitGroup = page.getByRole('group', { name: 'Object fit' });

  await expect(objectFitGroup).toBeVisible();
  await objectFitGroup.getByRole('button', { name: 'Cover' }).click();

  const logoNode = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await expect
    .poll(async () =>
      logoNode.evaluate((el) => {
        const asset = el.querySelector<HTMLElement>('img, video, [style*="object-fit"]');
        const target = asset ?? el;

        return getComputedStyle(target).objectFit;
      }),
    )
    .toBe('cover');
});

/**
 * @description Validates the typography panel → canvas parity flow: editing the
 * font size on a selected text element must commit through the NumField blur
 * pipeline and propagate the new font-size to the rendered canvas text node.
 */
test('editing font size in the typography panel updates the canvas text element font-size', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await selectLayer(page, 'Home Abbr');
  await openProperties(page);
  await expandAccordion(page, 'Typography');

  const fontSizeInput = page.getByRole('textbox', { name: 'Font size (pt)' });

  await fontSizeInput.click();
  await fontSizeInput.press('Control+a');
  await fontSizeInput.pressSequentially('96');
  await fontSizeInput.press('Enter');

  const textNode = page.locator(`[data-element-id="${FIXTURE_IDS.teamHome}"]`);

  await expect(textNode).toBeVisible();
  await expect
    .poll(async () =>
      textNode.evaluate((el) => {
        const inner = el.querySelector<HTMLElement>('[data-element-content] span') ?? el;

        return parseFloat(getComputedStyle(inner).fontSize);
      }),
    )
    .toBeGreaterThan(70);
});

/**
 * @description Validates the spacing panel → canvas parity flow: engaging the
 * link toggle and editing padding must broadcast to all four sides on the
 * canvas element's computed padding.
 */
test('editing linked padding in the spacing panel updates the canvas element padding', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await selectLayer(page, 'Home Abbr');
  await openProperties(page);
  await expandAccordion(page, 'Spacing');

  const linkToggle = page.getByRole('button', { name: /link padding/i });

  await linkToggle.click();
  await expect(linkToggle).toHaveAttribute('aria-pressed', 'true');

  const topInput = page.getByRole('textbox', { name: 'Padding top' });

  await topInput.fill('24');
  await topInput.press('Enter');

  const textNode = page.locator(`[data-element-id="${FIXTURE_IDS.teamHome}"]`);

  const readPadding = async (side: 'Top' | 'Right'): Promise<string> =>
    textNode.evaluate((el, key) => {
      const inner = el.querySelector<HTMLElement>('[data-element-content]') ?? el;

      return (getComputedStyle(inner) as unknown as Record<string, string>)[key] ?? '';
    }, `padding${side}`);

  await expect.poll(() => readPadding('Top')).toBe('24px');
  await expect.poll(() => readPadding('Right')).toBe('24px');
});
