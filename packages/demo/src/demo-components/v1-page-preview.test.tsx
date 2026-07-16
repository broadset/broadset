import { projectFormatV1 } from '@broadset/model';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1PagePreview } from './v1-page-preview';

interface PackagedFixture {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly assetId: projectFormatV1.Id;
  readonly digest: projectFormatV1.Sha256Digest;
  readonly bytes: Uint8Array;
  readonly imageAsset: projectFormatV1.Asset;
}

function packagedFixture(): PackagedFixture {
  const broadsetDocument = SAMPLE_PROJECT_V1.documents[0];
  const page = broadsetDocument?.pages[0];

  if (broadsetDocument === undefined || page === undefined) throw new Error('Expected sample document and page');

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
        ...broadsetDocument,
        elements: [...broadsetDocument.elements, imageElement],
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
          ...broadsetDocument.pages.slice(1),
        ],
      },
    ],
  };

  if (projectFormatV1.validateBroadsetProjectV1Semantics(project).length > 0)
    throw new Error('Expected valid packaged fixture');

  return {
    project,
    documentId: broadsetDocument.id,
    pageId: page.id,
    elementId,
    assetId,
    digest,
    bytes,
    imageAsset,
  };
}

function installObjectUrlMocks(): {
  readonly createObjectUrl: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  readonly revokeObjectUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
} {
  const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:package-image');
  const revokeObjectUrl = vi.fn<(url: string) => void>();

  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

  return { createObjectUrl, revokeObjectUrl };
}

describe('V1PagePreview', () => {
  it('creates renderer DOM in the preview host ownerDocument', async () => {
    const broadsetDocument = SAMPLE_PROJECT_V1.documents[0];
    const page = broadsetDocument?.pages[0];
    const alternateDocument = document.implementation.createHTMLDocument('preview');
    const container = alternateDocument.createElement('div');

    if (broadsetDocument === undefined || page === undefined) throw new Error('Expected sample page');
    alternateDocument.body.append(container);

    const mounted = render(
      <V1PagePreview documentId={broadsetDocument.id} pageId={page.id} project={SAMPLE_PROJECT_V1} />,
      { container },
    );

    await waitFor(() => {
      expect(container.querySelector('[data-broadset-canvas-root]')?.ownerDocument).toBe(alternateDocument);
    });
    mounted.unmount();
  });

  it('renders packaged blobs, fails closed for an external replacement, and prunes its prior URL', async () => {
    const fixture = packagedFixture();
    const { createObjectUrl, revokeObjectUrl } = installObjectUrlMocks();
    const { container, rerender } = render(
      <V1PagePreview
        blobs={new Map([[fixture.digest, fixture.bytes]])}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={fixture.project}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>(`[data-element-id="${fixture.elementId}"] img`)?.src).toBe(
        'blob:package-image',
      );
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const externalProject: projectFormatV1.BroadsetProjectV1 = {
      ...fixture.project,
      resources: {
        ...fixture.project.resources,
        assets: fixture.project.resources.assets.map((asset) =>
          asset.id === fixture.assetId ?
            {
              ...fixture.imageAsset,
              blob: {
                ...fixture.imageAsset.blob,
                source: {
                  kind: 'external',
                  url: 'https://untrusted.example/image.png',
                  integrity: fixture.digest,
                },
              },
            }
          : asset,
        ),
      },
    };

    rerender(<V1PagePreview documentId={fixture.documentId} pageId={fixture.pageId} project={externalProject} />);

    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>(`[data-element-id="${fixture.elementId}"] img`)).toBeNull();
      expect(container.textContent).toContain('requires verified loading');
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package-image');
    });
  });

  it('retains a packaged stroke paint URL across unrelated preview updates', async () => {
    const fixture = packagedFixture();
    const { revokeObjectUrl } = installObjectUrlMocks();
    const broadsetDocument = fixture.project.documents[0];

    if (broadsetDocument === undefined) throw new Error('Expected document');

    const vector = projectFormatV1.createElementV1({
      id: fixture.elementId,
      name: 'Stroke vector',
      geometry: projectFormatV1.createElementGeometry({ width: 20, height: 20 }),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        strokes: [
          {
            id: projectFormatV1.idSchema.parse('package-stroke'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'picture', assetId: fixture.assetId, fit: 'cover' },
            width: 2,
            alignment: 'center',
            cap: 'round',
            join: 'round',
            miterLimit: 4,
            dash: [],
            dashOffset: 0,
          },
        ],
      },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
    const strokeProject: projectFormatV1.BroadsetProjectV1 = {
      ...fixture.project,
      documents: [
        {
          ...broadsetDocument,
          elements: broadsetDocument.elements.map((element) => (element.id === fixture.elementId ? vector : element)),
        },
      ],
    };
    const blobs = new Map([[fixture.digest, fixture.bytes]]);
    const { container, rerender } = render(
      <V1PagePreview blobs={blobs} documentId={fixture.documentId} pageId={fixture.pageId} project={strokeProject} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector<HTMLElement>('[data-vector-stroke="package-stroke"] [data-paint-layer]')?.style
          .backgroundImage,
      ).toContain('blob:package-image');
    });

    rerender(
      <V1PagePreview
        blobs={blobs}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={{ ...strokeProject, metadata: { ...strokeProject.metadata } }}
      />,
    );

    await waitFor(() => {
      expect(revokeObjectUrl).not.toHaveBeenCalled();
    });
  });

  it('revokes and clears object URLs before discarding an invalid resolution', async () => {
    const fixture = packagedFixture();
    const { createObjectUrl, revokeObjectUrl } = installObjectUrlMocks();
    const { container, rerender } = render(
      <V1PagePreview
        blobs={new Map([[fixture.digest, fixture.bytes]])}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={fixture.project}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    rerender(
      <V1PagePreview
        documentId={projectFormatV1.idSchema.parse('missing-document')}
        pageId={fixture.pageId}
        project={fixture.project}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-broadset-canvas-root]')).toBeNull();
      expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    });

    rerender(
      <V1PagePreview
        blobs={new Map([[fixture.digest, fixture.bytes]])}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={fixture.project}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
      expect(createObjectUrl).toHaveBeenCalledTimes(2);
    });
  });

  it('revokes a package URL when its rendered element is removed but the resource remains', async () => {
    const fixture = packagedFixture();
    const { revokeObjectUrl } = installObjectUrlMocks();
    const blobs = new Map([[fixture.digest, fixture.bytes]]);
    const { container, rerender } = render(
      <V1PagePreview blobs={blobs} documentId={fixture.documentId} pageId={fixture.pageId} project={fixture.project} />,
    );

    await waitFor(() => {
      expect(container.querySelector(`[data-element-id="${fixture.elementId}"] img`)).not.toBeNull();
    });

    const broadsetDocument = fixture.project.documents[0];

    if (broadsetDocument === undefined) throw new Error('Expected document');

    const projectWithoutRenderedImage: projectFormatV1.BroadsetProjectV1 = {
      ...fixture.project,
      documents: [
        {
          ...broadsetDocument,
          elements: broadsetDocument.elements.filter((element) => element.id !== fixture.elementId),
          pages: broadsetDocument.pages.map((page) => ({
            ...page,
            rootInstances: page.rootInstances.filter((instance) => instance.elementId !== fixture.elementId),
          })),
        },
      ],
    };

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(projectWithoutRenderedImage)).toEqual([]);
    rerender(
      <V1PagePreview
        blobs={blobs}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={projectWithoutRenderedImage}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(`[data-element-id="${fixture.elementId}"]`)).toBeNull();
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package-image');
    });
  });

  it('retains a surface-paint URL across unrelated rerenders and revokes it when the paint is removed', async () => {
    const fixture = packagedFixture();
    const { revokeObjectUrl } = installObjectUrlMocks();
    const document = fixture.project.documents[0];

    if (document === undefined) throw new Error('Expected document');

    const surfaceProject: projectFormatV1.BroadsetProjectV1 = {
      ...fixture.project,
      documents: [
        {
          ...document,
          surface: { ...document.surface, background: { kind: 'picture', assetId: fixture.assetId, fit: 'cover' } },
          elements: document.elements.filter((element) => element.id !== fixture.elementId),
          pages: document.pages.map((page) => ({
            ...page,
            rootInstances: page.rootInstances.filter((instance) => instance.elementId !== fixture.elementId),
          })),
        },
      ],
    };
    const blobs = new Map([[fixture.digest, fixture.bytes]]);
    const { container, rerender } = render(
      <V1PagePreview blobs={blobs} documentId={fixture.documentId} pageId={fixture.pageId} project={surfaceProject} />,
    );

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('[data-paint-layer]')?.style.backgroundImage).toContain(
        'blob:package-image',
      );
    });

    rerender(
      <V1PagePreview
        blobs={blobs}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={{ ...surfaceProject }}
      />,
    );
    await waitFor(() => {
      expect(revokeObjectUrl).not.toHaveBeenCalled();
    });

    const surfaceDocument = surfaceProject.documents[0];

    if (surfaceDocument === undefined) throw new Error('Expected surface document');

    rerender(
      <V1PagePreview
        blobs={blobs}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={{
          ...surfaceProject,
          documents: [{ ...surfaceDocument, surface: { ...document.surface, background: { kind: 'none' } } }],
        }}
      />,
    );
    await waitFor(() => {
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package-image');
    });
  });

  it('keeps unaffected hosts/content stable across an unrelated same-page edit', async () => {
    const fixture = packagedFixture();

    installObjectUrlMocks();

    const blobs = new Map([[fixture.digest, fixture.bytes]]);
    const { container, rerender, unmount } = render(
      <V1PagePreview blobs={blobs} documentId={fixture.documentId} pageId={fixture.pageId} project={fixture.project} />,
    );

    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });

    const imageHost = container.querySelector(`[data-element-id="${fixture.elementId}"]`);
    const imageContent = imageHost?.querySelector('[data-element-content]');
    const broadsetDocument = fixture.project.documents[0];
    const unrelated = broadsetDocument?.elements.find((element) => element.id !== fixture.elementId);

    if (broadsetDocument === undefined || unrelated === undefined) throw new Error('Expected unrelated element');

    const editedProject: projectFormatV1.BroadsetProjectV1 = {
      ...fixture.project,
      documents: [
        {
          ...broadsetDocument,
          elements: broadsetDocument.elements.map((element) =>
            element.id === unrelated.id ?
              { ...element, appearance: { ...element.appearance, opacity: 0.75 } }
            : element,
          ),
        },
      ],
    };

    rerender(
      <V1PagePreview blobs={blobs} documentId={fixture.documentId} pageId={fixture.pageId} project={editedProject} />,
    );

    await waitFor(() => {
      expect(container.querySelector(`[data-element-id="${fixture.elementId}"]`)).toBe(imageHost);
      expect(imageHost?.querySelector('[data-element-content]')).toBe(imageContent);
    });

    const root = container.querySelector('[data-broadset-canvas-root]');

    unmount();
    expect(root?.isConnected).toBe(false);
  });

  it('revokes a live package URL on unmount', async () => {
    const fixture = packagedFixture();
    const { revokeObjectUrl } = installObjectUrlMocks();
    const { container, unmount } = render(
      <V1PagePreview
        blobs={new Map([[fixture.digest, fixture.bytes]])}
        documentId={fixture.documentId}
        pageId={fixture.pageId}
        project={fixture.project}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package-image');
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });
});
