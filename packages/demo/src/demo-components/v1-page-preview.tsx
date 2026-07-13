import type { projectFormatV1 } from '@broadset/model';
import { renderPageV1 } from '@broadset/renderer';
import { useLayoutEffect, useRef } from 'react';

import { resolveProjectAssetUrlV1, selectDocumentV1 } from '../v1-demo-project';

const EMPTY_BLOBS: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map();

interface V1PagePreviewProps {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly className?: string | undefined;
}

function createAssetResolver(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly objectUrls: Map<projectFormatV1.Sha256Digest, string>;
}): (assetId: projectFormatV1.Id) => string | undefined {
  return (assetId): string | undefined => {
    const externalUrl = resolveProjectAssetUrlV1(options.project, assetId);

    if (externalUrl !== null) return externalUrl;

    const asset = options.project.resources.assets.find(({ id }) => id === assetId);

    if (asset?.blob.source.kind !== 'package') return undefined;

    const existing = options.objectUrls.get(asset.blob.digest);

    if (existing !== undefined) return existing;

    const bytes = options.blobs.get(asset.blob.digest);

    if (bytes === undefined) return undefined;

    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: asset.blob.mediaType }));

    options.objectUrls.set(asset.blob.digest, url);

    return url;
  };
}

export function V1PagePreview({
  project,
  blobs = EMPTY_BLOBS,
  documentId,
  pageId,
  className,
}: V1PagePreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const document = selectDocumentV1(project, documentId);

  useLayoutEffect(() => {
    const host = hostRef.current;

    if (host === null) return;

    const objectUrls = new Map<projectFormatV1.Sha256Digest, string>();

    const scene = renderPageV1({
      project,
      documentId,
      pageId,
      context: {
        swatches: new Map(project.resources.swatches.map((swatch) => [swatch.id, swatch])),
        fonts: new Map(project.resources.fonts.map((font) => [font.id, font])),
        resolveAssetUrl: createAssetResolver({ project, blobs, objectUrls }),
        document: host.ownerDocument,
      },
    });

    host.replaceChildren(scene);

    return () => {
      host.replaceChildren();
      objectUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [blobs, documentId, pageId, project]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-broadset-element-layer="true"
      data-testid="v1-page-preview"
      style={{
        height: document?.surface.size[1],
        overflow: 'visible',
        pointerEvents: 'none',
        position: 'relative',
        transformStyle: 'preserve-3d',
        width: document?.surface.size[0],
      }}
    />
  );
}
