import { exportPptxBytes } from '@broadset/formats';
import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

/**
 * @description Visual import CT — closes the 2026-04-28 production-
 * readiness audit finding "Imported format documents can be invisible
 * because page instances are empty". The earlier `pptx-chain.ct.tsx`
 * polled only the editor store; it would have happily passed even when
 * the imported document had no `PageElementInstance` entries and the
 * canvas / layer panel rendered empty.
 *
 * This CT asserts the *visual* surfaces a user sees after import:
 *
 *   - The layer panel enumerates the imported element.
 *   - The renderer host emits a DOM node carrying the imported
 *     element's `data-element-id`.
 *
 * If either assertion fails, the importer dropped the page-instance
 * step and an end-user would see an empty canvas despite a green
 * "import complete" toast.
 */

const VISUAL_RECT_ID = 'visual-rect';

function buildVisualPptxBytes(): Buffer {
  const baseDoc = {
    ...createEmptyBroadsetDocument(),
    elements: [
      createDefaultElement('rectangle', {
        id: VISUAL_RECT_ID,
        name: 'Visual rectangle',
        position: { x: 25, y: 30 },
        width: 50,
        height: 30,
      }),
    ],
  };

  return Buffer.from(exportPptxBytes(baseDoc));
}

test('imported PPTX rectangle shows up in the canvas and the layers panel', async ({ mount, page }) => {
  test.setTimeout(60_000);

  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-shell')).toBeVisible();

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles({
    name: 'visual.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: buildVisualPptxBytes(),
  });

  await expect(page.getByText(/import complete/i)).toBeVisible({ timeout: 30_000 });

  // Canvas surface — the renderer host MUST emit a DOM node carrying
  // the imported element's data-element-id. This is the definitive
  // "is the user actually seeing the import?" check.
  const canvasNode = page.locator(`[data-testid="screen-renderer-host"] [data-element-id="${VISUAL_RECT_ID}"]`);

  await expect(canvasNode).toBeAttached({ timeout: 10_000 });

  // Layers panel surface — every imported root MUST be enumerated so
  // the user can find/select it. The PPTX importer may fall back to
  // the stable element id when shape names are not available, so assert
  // the selectable layer row rather than a source-format display name.
  const layersTab = page.getByRole('tab', { name: /layers/i });

  if ((await layersTab.count()) > 0) {
    await layersTab.first().click();
  }

  await expect(page.getByRole('button', { name: `Select ${VISUAL_RECT_ID}` })).toBeVisible({ timeout: 10_000 });
});
