import { exportPptxBytesV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

const FIXTURE_RECT_ID = projectFormatV1.idSchema.parse('chain-rect');
const ORIGINAL_X = 25;
const ORIGINAL_Y = 30;
const EDITED_X = 80;
const EDITED_Y = 60;

function buildFixtureProject(): projectFormatV1.BroadsetProjectV1 {
  const rootId = projectFormatV1.idSchema.parse('chain-root');

  return projectFormatV1.createProjectV1({
    documents: [
      projectFormatV1.createDocumentV1({
        id: projectFormatV1.idSchema.parse('chain-document'),
        elements: [
          projectFormatV1.createElementV1({
            id: rootId,
            kind: 'group',
            name: 'Chain root',
            geometry: projectFormatV1.createElementGeometry({ width: 320, height: 180 }),
          }),
          projectFormatV1.createElementV1({
            id: FIXTURE_RECT_ID,
            kind: 'vector',
            name: 'Chain rectangle',
            parentId: rootId,
            geometry: projectFormatV1.createElementGeometry({
              width: 40,
              height: 25,
              transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, ORIGINAL_X, ORIGINAL_Y] },
            }),
            geometryData: projectFormatV1.createRectangleGeometry(),
          }),
        ],
        pages: [
          projectFormatV1.createPageV1({
            id: projectFormatV1.idSchema.parse('chain-page'),
            name: 'Chain slide',
            rootInstances: [
              {
                id: projectFormatV1.idSchema.parse('chain-root-instance'),
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

test('PPTX import → edit → re-export → re-import preserves the edit', async ({ mount, page }) => {
  test.setTimeout(60_000);
  await mount(<DemoApp />);

  const fileInput = page.getByLabel('Choose Broadset project file');
  const originalBytes = await exportPptxBytesV1({ project: buildFixtureProject(), blobs: new Map() });

  await fileInput.setInputFiles({
    name: 'chain.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from(originalBytes),
  });
  await expect(page.getByRole('status')).toHaveText('Project loaded', { timeout: 30_000 });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = window.__broadsetProjectEditorStore
          ?.getState()
          .project.documents[0]?.elements.find(({ name }) => name === 'Chain rectangle');
        const matrix = element?.geometry.transform.kind === 'affine2d' ? element.geometry.transform.matrix : undefined;

        return matrix === undefined ? null : { x: matrix[4], y: matrix[5] };
      }),
    )
    .toEqual({ x: expect.closeTo(ORIGINAL_X, 1), y: expect.closeTo(ORIGINAL_Y, 1) });

  await page.evaluate(
    ({ x, y }) => {
      const state = window.__broadsetProjectEditorStore?.getState();
      const element = state?.project.documents[0]?.elements.find(({ name }) => name === 'Chain rectangle');

      if (state !== undefined && element !== undefined) state.commitElementUpdate(element.id, { position: { x, y } });
    },
    { x: EDITED_X, y: EDITED_Y },
  );

  const editedProjectUnknown: unknown = await page.evaluate(
    () => window.__broadsetProjectEditorStore?.getState().project,
  );
  const editedProject = projectFormatV1.broadsetProjectV1Schema.parse(editedProjectUnknown);
  const editedBytes = await exportPptxBytesV1({ project: editedProject, blobs: new Map() });

  await fileInput.setInputFiles({
    name: 'chain-edited.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from(editedBytes),
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = window.__broadsetProjectEditorStore
          ?.getState()
          .project.documents[0]?.elements.find(({ name }) => name === 'Chain rectangle');
        const matrix = element?.geometry.transform.kind === 'affine2d' ? element.geometry.transform.matrix : undefined;

        return matrix === undefined ? null : { x: matrix[4], y: matrix[5] };
      }),
    )
    .toEqual({ x: expect.closeTo(EDITED_X, 1), y: expect.closeTo(EDITED_Y, 1) });
});
