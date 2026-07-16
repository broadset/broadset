import type { projectFormatV1 } from '@broadset/model';
import { resolveSceneSnapshotV1 } from '@broadset/playback';
import {
  createResolvedSceneDomV1,
  type RenderContextV1,
  type ResolvedRenderAssetV1,
  type ResolvedSceneDomV1,
  spatialValueToCssPixelsV1,
} from '@broadset/renderer';
import { useLayoutEffect, useMemo, useRef } from 'react';

import { selectDocumentV1 } from '../v1-demo-project';

const EMPTY_BLOBS: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map();

interface V1PagePreviewProps {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly sequenceId?: projectFormatV1.Id | null | undefined;
  readonly tick?: number | undefined;
  readonly className?: string | undefined;
}

interface PreviewRendererStateV1 {
  readonly handle: ResolvedSceneDomV1;
  readonly objectUrls: Map<projectFormatV1.Sha256Digest, string>;
  readonly context: RenderContextV1;
}

function createAssetResolver(options: {
  readonly assetsById: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Asset>;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly objectUrls: Map<projectFormatV1.Sha256Digest, string>;
}): RenderContextV1['resolveAsset'] {
  return (assetId): ResolvedRenderAssetV1 => {
    const asset = options.assetsById.get(assetId);

    if (asset?.blob.source.kind === 'external') {
      return { status: 'missing', diagnostic: `External asset ${String(assetId)} requires verified loading` };
    }

    if (asset?.blob.source.kind !== 'package') {
      return { status: 'missing', diagnostic: `Asset ${String(assetId)} is unavailable` };
    }

    const existing = options.objectUrls.get(asset.blob.digest);

    if (existing !== undefined) return { status: 'ready', url: existing };

    const bytes = options.blobs.get(asset.blob.digest);

    if (bytes === undefined) return { status: 'missing', diagnostic: `Asset ${String(assetId)} bytes are unavailable` };

    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: asset.blob.mediaType }));

    options.objectUrls.set(asset.blob.digest, url);

    return { status: 'ready', url };
  };
}

function renderedAssetIds(snapshot: projectFormatV1.ResolvedSceneSnapshotV1): ReadonlySet<projectFormatV1.Id> {
  const assetIds = new Set<projectFormatV1.Id>();
  const addPaintAsset = (paint: projectFormatV1.Paint): void => {
    if (paint.kind === 'picture' || paint.kind === 'pattern') assetIds.add(paint.assetId);
  };

  addPaintAsset(snapshot.surface.background);

  snapshot.nodes.forEach(({ element }) => {
    if (element.appearance.fills.length + element.appearance.strokes.length + element.appearance.effects.length <= 64) {
      element.appearance.fills.forEach((fill) => {
        if (fill.enabled) addPaintAsset(fill.paint);
      });
      element.appearance.strokes.forEach((stroke) => {
        if (stroke.enabled) addPaintAsset(stroke.paint);
      });
    }

    switch (element.kind) {
      case 'image':
        assetIds.add(element.image.assetId);
        break;
      case 'video':
        assetIds.add(element.video.assetId);
        break;
      case 'audio':
        assetIds.add(element.audio.assetId);
        break;
      case 'foreign':
        assetIds.add(element.foreign.previewAssetId);
        break;
      case 'plugin':
        if (element.plugin.previewAssetId !== undefined) assetIds.add(element.plugin.previewAssetId);
        break;
      case 'text':
      case 'vector':
      case 'group':
      case 'component-instance':
      case 'clock':
      case 'ticker':
      case 'qrcode':
        break;
    }
  });

  return assetIds;
}

function projectWithPreviewSequence(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly sequenceId: projectFormatV1.Id | null;
}): projectFormatV1.BroadsetProjectV1 {
  if (options.sequenceId === null) return options.project;

  const document = options.project.documents.find(({ id }) => id === options.documentId);

  if (!document?.sequences.some(({ id }) => id === options.sequenceId)) return options.project;

  const page = document.pages.find(({ id }) => id === options.pageId);

  if (page === undefined || page.sequenceId === options.sequenceId) return options.project;

  return {
    ...options.project,
    documents: options.project.documents.map((candidate) =>
      candidate.id === document.id ?
        {
          ...candidate,
          pages: candidate.pages.map((candidatePage) =>
            candidatePage.id === page.id ?
              { ...candidatePage, sequenceId: options.sequenceId ?? undefined }
            : candidatePage,
          ),
        }
      : candidate,
    ),
  };
}

export function V1PagePreview({
  project,
  blobs = EMPTY_BLOBS,
  documentId,
  pageId,
  sequenceId = null,
  tick = 0,
  className,
}: V1PagePreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PreviewRendererStateV1 | null>(null);
  const objectUrls = useMemo(() => new Map<projectFormatV1.Sha256Digest, string>(), []);
  const broadsetDocument = selectDocumentV1(project, documentId);
  const previewProject = useMemo(
    () => projectWithPreviewSequence({ project, documentId, pageId, sequenceId }),
    [documentId, pageId, project, sequenceId],
  );
  const assetsById = useMemo(
    () => new Map(project.resources.assets.map((asset) => [asset.id, asset])),
    [project.resources.assets],
  );
  const swatches = useMemo(
    () => new Map(project.resources.swatches.map((swatch) => [swatch.id, swatch])),
    [project.resources.swatches],
  );
  const fonts = useMemo(
    () => new Map(project.resources.fonts.map((font) => [font.id, font])),
    [project.resources.fonts],
  );
  const resolveAsset = useMemo(
    () => createAssetResolver({ assetsById, blobs, objectUrls }),
    [assetsById, blobs, objectUrls],
  );
  const units =
    broadsetDocument === undefined ? undefined : (
      { unit: broadsetDocument.surface.unit, dpi: broadsetDocument.surface.dpi }
    );

  useLayoutEffect(() => {
    const host = hostRef.current;

    if (host === null) return;

    const result = resolveSceneSnapshotV1({
      project: previewProject,
      documentId,
      pageId,
      tick,
      fieldValues: [],
      events: [],
    });

    if (result.status === 'invalid') {
      const state = rendererRef.current;

      state?.handle.destroy();
      state?.objectUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      state?.objectUrls.clear();
      rendererRef.current = null;
      host.replaceChildren();

      return;
    }

    const retainedDigests = new Set<projectFormatV1.Sha256Digest>();

    renderedAssetIds(result.snapshot).forEach((assetId) => {
      const asset = assetsById.get(assetId);

      if (asset?.blob.source.kind === 'package') retainedDigests.add(asset.blob.digest);
    });

    objectUrls.forEach((url, digest) => {
      if (!retainedDigests.has(digest)) {
        URL.revokeObjectURL(url);
        objectUrls.delete(digest);
      }
    });

    const previousContext = rendererRef.current?.context;
    const renderContext =
      (
        previousContext?.swatches === swatches &&
        previousContext.fonts === fonts &&
        previousContext.resolveAsset === resolveAsset &&
        previousContext.document === host.ownerDocument
      ) ?
        previousContext
      : { swatches, fonts, resolveAsset, document: host.ownerDocument };

    if (rendererRef.current === null) {
      const handle = createResolvedSceneDomV1({ snapshot: result.snapshot, context: renderContext });

      rendererRef.current = { handle, objectUrls, context: renderContext };
      host.replaceChildren(handle.root);
    } else {
      rendererRef.current.handle.update(result.snapshot, renderContext);
      rendererRef.current = { ...rendererRef.current, context: renderContext };
    }
  }, [assetsById, documentId, fonts, objectUrls, pageId, previewProject, resolveAsset, swatches, tick]);

  useLayoutEffect(
    () => () => {
      const state = rendererRef.current;

      state?.handle.destroy();
      state?.objectUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      state?.objectUrls.clear();
      rendererRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="v1-page-preview"
      style={{
        height:
          broadsetDocument === undefined || units === undefined ?
            undefined
          : spatialValueToCssPixelsV1(broadsetDocument.surface.size[1], units),
        overflow: 'visible',
        pointerEvents: 'none',
        position: 'relative',
        transformStyle: 'preserve-3d',
        width:
          broadsetDocument === undefined || units === undefined ?
            undefined
          : spatialValueToCssPixelsV1(broadsetDocument.surface.size[0], units),
      }}
    />
  );
}
