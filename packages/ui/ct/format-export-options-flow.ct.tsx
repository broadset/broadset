import { expect, test } from '@playwright/experimental-ct-react';

import { ExportModalFormatOptionsHarness } from './format-export-options-flow.stories';

/**
 * Phase 1.1 (cross-format-io-improvement-plan) — wiring tests for
 * ExportModal ↔ FormatExportOptionsModal. Each test exercises one
 * format's "select format → open options → confirm → export" round
 * trip and asserts the format-scoped options block lands on the
 * `onExport` payload.
 *
 * The HeroUI `Modal` portals its dialog content outside the React
 * root (`#root`), so dialog interactions go through `page` while
 * harness `<output>` elements stay inside `component`.
 */

test.describe('ExportModal × FormatExportOptionsModal wiring', () => {
  /**
   * @description SVG flow — clicking SVG, opening Options, confirming
   * with seeded defaults, then clicking outer Export emits
   * `data.svgOptions` carrying `fontEmbedding`, `includeMetadata`,
   * `includeElementTagging`.
   */
  test('SVG format forwards svgOptions on export', async ({ mount, page }) => {
    const component = await mount(<ExportModalFormatOptionsHarness format="svg" />);

    await page.getByRole('button', { name: 'SVG', exact: true }).click();
    await page.getByRole('button', { name: /open svg export options/i }).click();
    await page.getByRole('button', { name: 'Confirm export options' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    await expect(component.getByLabel('export-call-count')).toHaveText('1');

    const payloadText = await component.getByLabel('export-call-payload').textContent();
    const payload = JSON.parse(payloadText ?? 'null') as { exporter: string; data: Record<string, unknown> } | null;

    expect(payload?.exporter).toBe('svg');
    expect(payload?.data['svgOptions']).toEqual({
      fontEmbedding: 'embed',
      includeMetadata: true,
      includeElementTagging: true,
    });
  });

  /**
   * @description SVG flow — opening the FormatExportOptionsModal,
   * clicking the "Font embedding" Select, choosing the "Flatten text
   * to paths" option, confirming, then exporting. Asserts the new
   * value is forwarded as `data.svgOptions.fontEmbedding === 'flatten'`.
   *
   * This validates the migration from raw `<option>` children to the
   * canonical `Select.Trigger` / `Select.Popover` / `ListBox` shape —
   * raw `<option>` rendered nothing under react-aria-components in a
   * real browser, so this drop-down click was previously impossible.
   */
  test('SVG font-embedding Select can change value end-to-end', async ({ mount, page }) => {
    const component = await mount(<ExportModalFormatOptionsHarness format="svg" />);

    await page.getByRole('button', { name: 'SVG', exact: true }).click();
    await page.getByRole('button', { name: /open svg export options/i }).click();

    await page.getByRole('button', { name: 'Font embedding' }).click();
    await page.getByRole('option', { name: 'Flatten text to paths' }).click();

    await page.getByRole('button', { name: 'Confirm export options' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    await expect(component.getByLabel('export-call-count')).toHaveText('1');

    const payloadText = await component.getByLabel('export-call-payload').textContent();
    const payload = JSON.parse(payloadText ?? 'null') as { exporter: string; data: Record<string, unknown> } | null;
    const svgOptions = payload?.data['svgOptions'] as { fontEmbedding: string } | undefined;

    expect(svgOptions?.fontEmbedding).toBe('flatten');
  });

  /**
   * @description PSD flow — same round trip emits `psdOptions` with
   * the five PSD-supported fields (colorSpace, bitDepth, embedIccProfile,
   * linkSmartObjects, preserveVisibility).
   */
  test('PSD format forwards psdOptions on export', async ({ mount, page }) => {
    const component = await mount(<ExportModalFormatOptionsHarness format="psd" />);

    await page.getByRole('button', { name: 'PSD', exact: true }).click();
    await page.getByRole('button', { name: /open psd export options/i }).click();
    await page.getByRole('button', { name: 'Confirm export options' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    await expect(component.getByLabel('export-call-count')).toHaveText('1');

    const payloadText = await component.getByLabel('export-call-payload').textContent();
    const payload = JSON.parse(payloadText ?? 'null') as { exporter: string; data: Record<string, unknown> } | null;

    expect(payload?.exporter).toBe('psd');
    expect(payload?.data['psdOptions']).toEqual({
      colorSpace: 'rgb',
      bitDepth: 8,
      embedIccProfile: true,
      linkSmartObjects: false,
      preserveVisibility: true,
    });
  });

  /**
   * @description PDF flow — round trip emits `pdfOptions` with
   * `colorSpace` + `pdfaConformance`.
   */
  test('PDF format forwards pdfOptions on export', async ({ mount, page }) => {
    const component = await mount(<ExportModalFormatOptionsHarness format="pdf" />);

    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await page.getByRole('button', { name: /open pdf export options/i }).click();
    await page.getByRole('button', { name: 'Confirm export options' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    await expect(component.getByLabel('export-call-count')).toHaveText('1');

    const payloadText = await component.getByLabel('export-call-payload').textContent();
    const payload = JSON.parse(payloadText ?? 'null') as { exporter: string; data: Record<string, unknown> } | null;

    expect(payload?.exporter).toBe('pdf');
    expect(payload?.data['pdfOptions']).toEqual({
      colorSpace: 'rgb',
      pdfaConformance: 'none',
    });
  });

  /**
   * @description PPTX flow — round trip emits `pptxOptions` with
   * the single supported field, `embedFonts`.
   */
  test('PPTX format forwards pptxOptions on export', async ({ mount, page }) => {
    const component = await mount(<ExportModalFormatOptionsHarness format="pptx" />);

    await page.getByRole('button', { name: 'PPTX', exact: true }).click();
    await page.getByRole('button', { name: /open pptx export options/i }).click();
    await page.getByRole('button', { name: 'Confirm export options' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    await expect(component.getByLabel('export-call-count')).toHaveText('1');

    const payloadText = await component.getByLabel('export-call-payload').textContent();
    const payload = JSON.parse(payloadText ?? 'null') as { exporter: string; data: Record<string, unknown> } | null;

    expect(payload?.exporter).toBe('pptx');
    expect(payload?.data['pptxOptions']).toEqual({
      embedFonts: false,
    });
  });
});
