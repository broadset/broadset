import { projectFormatV1 } from '@broadset/model';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1PagePreview } from './v1-page-preview';

describe('V1PagePreview', () => {
  it('renders packaged v1 image assets from the project blob registry', async () => {
    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:package-image');
    const revokeObjectUrl = vi.fn<(url: string) => void>();

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

    const document = SAMPLE_PROJECT_V1.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected sample document and page');

    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'b'.repeat(64)}`);
    const assetId = projectFormatV1.idSchema.parse('package-image-asset');
    const elementId = projectFormatV1.idSchema.parse('package-image');
    const imageAsset = projectFormatV1.assetSchema.parse({
      id: assetId,
      kind: 'image',
      name: 'Packaged image',
      blob: {
        digest,
        byteLength: bytes.byteLength,
        mediaType: 'image/png',
        source: { kind: 'package', path: `blobs/sha256/${'b'.repeat(64)}` },
      },
      metadata: {
        pixelWidth: 1,
        pixelHeight: 1,
        orientation: 1,
        hasAlpha: true,
        bitDepth: 8,
        colorModel: 'rgb',
      },
    });
    const imageElement = projectFormatV1.createElementV1({
      id: elementId,
      name: 'Packaged image',
      geometry: projectFormatV1.createElementGeometry({ width: 20, height: 20 }),
      kind: 'image',
      image: { assetId, fit: 'contain' },
    });
    const project: projectFormatV1.BroadsetProjectV1 = {
      ...SAMPLE_PROJECT_V1,
      resources: {
        ...SAMPLE_PROJECT_V1.resources,
        assets: [...SAMPLE_PROJECT_V1.resources.assets, imageAsset],
      },
      documents: [
        {
          ...document,
          elements: [...document.elements, imageElement],
          pages: [
            {
              ...page,
              rootInstances: [
                ...page.rootInstances,
                {
                  id: projectFormatV1.idSchema.parse('package-image-root'),
                  elementId,
                  overrides: [],
                  componentPropertyValues: [],
                },
              ],
            },
            ...document.pages.slice(1),
          ],
        },
      ],
    };

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);

    const { container, unmount } = render(
      <V1PagePreview blobs={new Map([[digest, bytes]])} documentId={document.id} pageId={page.id} project={project} />,
    );

    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>(`[data-element-id="${elementId}"] img`)?.src).toBe(
        'blob:package-image',
      );
    });

    expect(createObjectUrl).toHaveBeenCalledOnce();

    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package-image');
  });
});
