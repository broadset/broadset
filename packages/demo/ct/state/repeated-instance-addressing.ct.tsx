import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { SAMPLE_PROJECT_V1 } from '../../src/sample-project-v1';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

const REPEATED_ROOT_ID = projectFormatV1.idSchema.parse('ct-repeated-root');

function repeatedRootProject(): {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly elementId: projectFormatV1.Id;
  readonly elementName: string;
} {
  const document = SAMPLE_PROJECT_V1.documents[0];
  const page = document?.pages[0];
  const sourceRoot = page?.rootInstances[0];
  const element = document?.elements.find((candidate) => candidate.id === sourceRoot?.elementId);

  if (document === undefined || page === undefined || sourceRoot === undefined || element === undefined) {
    throw new Error('Expected the native sample root fixture');
  }

  return {
    project: {
      ...SAMPLE_PROJECT_V1,
      documents: [
        {
          ...document,
          pages: [
            {
              ...page,
              rootInstances: [
                sourceRoot,
                {
                  ...sourceRoot,
                  id: REPEATED_ROOT_ID,
                  transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 100, 0] },
                },
                ...page.rootInstances.slice(1),
              ],
            },
            ...document.pages.slice(1),
          ],
        },
      ],
    },
    elementId: element.id,
    elementName: element.name,
  };
}

test('repeated placements keep selection and visibility scoped to their instance address', async ({ mount, page }) => {
  const fixture = repeatedRootProject();

  await mount(<DemoAppStored project={fixture.project} />);

  const repeatedCanvasNode = page.locator(`[data-element-id="${fixture.elementId}"]`).nth(1);

  await expect(repeatedCanvasNode).toBeAttached();
  await repeatedCanvasNode.dispatchEvent('pointerdown', { button: 0, buttons: 1 });

  await expect
    .poll(() =>
      page.evaluate(() => window.__broadsetProjectEditorStore?.getState().activeInstanceAddresses[0]?.rootInstanceId),
    )
    .toBe(REPEATED_ROOT_ID);

  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(page.getByRole('button', { name: `Select ${fixture.elementName}`, exact: true })).toHaveCount(2);

  await page.getByLabel(`Hide ${fixture.elementName}`).nth(1).click();

  await expect
    .poll(() =>
      page.evaluate((rootInstanceId) => {
        const state = window.__broadsetProjectEditorStore?.getState();
        const root = state?.project.documents[0]?.pages[0]?.rootInstances.find(({ id }) => id === rootInstanceId);

        return root?.visible;
      }, REPEATED_ROOT_ID),
    )
    .toBe(false);

  await expect
    .poll(() =>
      page.evaluate(
        () => window.__broadsetProjectEditorStore?.getState().project.documents[0]?.pages[0]?.rootInstances[0]?.visible,
      ),
    )
    .toBe(true);
});
