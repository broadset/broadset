import type { projectFormatV1 } from '@broadset/model';
import { renderPageV1 } from '@broadset/renderer';
import { useLayoutEffect, useRef } from 'react';

import { resolveProjectAssetUrlV1, selectDocumentV1 } from '../v1-demo-project';

export interface V1PagePreviewProps {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly className?: string | undefined;
}

export function V1PagePreview({ project, documentId, pageId, className }: V1PagePreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const document = selectDocumentV1(project, documentId);

  useLayoutEffect(() => {
    const host = hostRef.current;

    if (host === null) return;

    const scene = renderPageV1({
      project,
      documentId,
      pageId,
      context: {
        swatches: new Map(project.resources.swatches.map((swatch) => [swatch.id, swatch])),
        fonts: new Map(project.resources.fonts.map((font) => [font.id, font])),
        resolveAssetUrl: (assetId): string | undefined => resolveProjectAssetUrlV1(project, assetId) ?? undefined,
        document: host.ownerDocument,
      },
    });

    host.replaceChildren(scene);

    return () => {
      host.replaceChildren();
    };
  }, [documentId, pageId, project]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="v1-page-preview"
      style={{
        height: document?.surface.size[1],
        overflow: 'hidden',
        position: 'relative',
        width: document?.surface.size[0],
      }}
    />
  );
}
