import { exportPptxBytesV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

const VISUAL_RECT_ID = projectFormatV1.idSchema.parse('visual-rect');

function buildVisualProject(): projectFormatV1.BroadsetProjectV1 {
  const rootId = projectFormatV1.idSchema.parse('visual-root');
  const pageId = projectFormatV1.idSchema.parse('visual-page');

  return projectFormatV1.createProjectV1({
    documents: [
      projectFormatV1.createDocumentV1({
        id: projectFormatV1.idSchema.parse('visual-document'),
        elements: [
          projectFormatV1.createElementV1({
            id: rootId,
            kind: 'group',
            name: 'Visual root',
            geometry: projectFormatV1.createElementGeometry({ width: 320, height: 180 }),
          }),
          projectFormatV1.createElementV1({
            id: VISUAL_RECT_ID,
            kind: 'vector',
            name: 'Visual rectangle',
            parentId: rootId,
            geometry: projectFormatV1.createElementGeometry({
              width: 50,
              height: 30,
              transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 25, 30] },
            }),
            geometryData: projectFormatV1.createRectangleGeometry(),
          }),
        ],
        pages: [
          projectFormatV1.createPageV1({
            id: pageId,
            name: 'Visual slide',
            rootInstances: [
              {
                id: projectFormatV1.idSchema.parse('visual-root-instance'),
                elementId: rootId,
                visible: true,
                overrides: [],
                componentPropertyValues: [],
              },
            ],
          }),
        ],
        surface: { ...projectFormatV1.createDefaultSurface(), size: [320, 180], unit: 'px', dpi: 72 },
      }),
    ],
  });
}

test('imported PPTX rectangle shows up in the canvas and the layers panel', async ({ mount, page }) => {
  test.setTimeout(60_000);
  await mount(<DemoApp />);

  const bytes = await exportPptxBytesV1({ project: buildVisualProject(), blobs: new Map() });

  await page.getByLabel('Choose Broadset project file').setInputFiles({
    name: 'visual.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from(bytes),
  });

  await expect(page.getByRole('status')).toHaveText('Project loaded', { timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__broadsetProjectEditorStore
            ?.getState()
            .project.documents[0]?.elements.find(({ name }) => name === 'Visual rectangle')?.id ?? null,
      ),
    )
    .not.toBeNull();

  const importedId = await page.evaluate(
    () =>
      window.__broadsetProjectEditorStore
        ?.getState()
        .project.documents[0]?.elements.find(({ name }) => name === 'Visual rectangle')?.id ?? null,
  );

  await expect(page.locator(`[data-element-id="${String(importedId)}"]`)).toBeAttached();

  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(page.getByRole('button', { name: 'Select Visual rectangle' })).toBeVisible();
});
