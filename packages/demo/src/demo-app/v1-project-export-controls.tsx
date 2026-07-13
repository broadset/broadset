import type { ProjectEditorStore } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import { Button } from '@heroui/react';
import { useState } from 'react';

import { loadFormats } from '../formats-loader';
import { downloadBlob } from './v1-browser-download';

type ExportKind = 'svg' | 'pdf' | 'psd' | 'pptx' | 'mp4';

const EXPORT_KINDS: readonly ExportKind[] = ['svg', 'pdf', 'psd', 'pptx', 'mp4'];

interface ExportArtifact {
  readonly blob: Blob;
  readonly filename: string;
}

interface V1ProjectExportControlsProps {
  readonly editorStore: ProjectEditorStore;
  readonly download?: ((blob: Blob, filename: string) => void) | undefined;
}

function dataUri(bytes: Uint8Array, mediaType: string): string {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mediaType};base64,${btoa(binary)}`;
}

function resolveAssetHref(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly assetId: projectFormatV1.Id;
}): string | undefined {
  const asset = options.project.resources.assets.find(({ id }) => id === options.assetId);

  if (asset === undefined) return undefined;
  if (asset.blob.source.kind === 'external') return asset.blob.source.url;

  const bytes = options.blobs.get(asset.blob.digest);

  return bytes === undefined ? undefined : dataUri(bytes, asset.blob.mediaType);
}

function bytesBlob(bytes: Uint8Array, mediaType: string): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: mediaType });
}

async function buildExport(
  kind: ExportKind,
  state: ReturnType<ProjectEditorStore['getState']>,
): Promise<ExportArtifact> {
  const formats = await loadFormats();
  const input = {
    project: state.project,
    documentId: state.activeDocumentId,
    pageId: state.activePageId,
    blobs: state.blobs,
  };

  switch (kind) {
    case 'svg': {
      const markup = formats.exportSvgStringV1({
        ...input,
        resolveAssetHref: (assetId): string | undefined =>
          resolveAssetHref({ project: state.project, blobs: state.blobs, assetId }),
      });

      return { blob: new Blob([markup], { type: 'image/svg+xml' }), filename: 'broadset-page.svg' };
    }

    case 'pdf':
      return {
        blob: bytesBlob(await formats.exportPdfBytesV1(input), 'application/pdf'),
        filename: 'broadset-page.pdf',
      };
    case 'psd':
      return {
        blob: bytesBlob(await formats.exportPsdBytesV1(input), 'image/vnd.adobe.photoshop'),
        filename: 'broadset-document.psd',
      };
    case 'pptx':
      return {
        blob: bytesBlob(
          await formats.exportPptxBytesV1(input),
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ),
        filename: 'broadset-document.pptx',
      };

    case 'mp4': {
      const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);
      const rendererRoot = formats.discoverRendererRoot();

      if (document === undefined) throw new Error('Active v1 document is unavailable');
      if (rendererRoot === null) throw new Error('Active v1 renderer is unavailable');

      const canvas = await formats.captureElementToCanvas(
        rendererRoot,
        document.surface.size[0],
        document.surface.size[1],
      );
      const blob = await formats.exportVideoBlob({
        canvas,
        durationMs: 500,
        format: 'mp4',
        frameRate: 2,
        renderFrame: () => {},
      });

      return { blob, filename: 'broadset-page.mp4' };
    }
  }
}

export function V1ProjectExportControls({
  editorStore,
  download = downloadBlob,
}: V1ProjectExportControlsProps): React.JSX.Element {
  const [message, setMessage] = useState('');
  const exportKind = async (kind: ExportKind): Promise<void> => {
    try {
      const artifact = await buildExport(kind, editorStore.getState());

      download(artifact.blob, artifact.filename);
      setMessage(`${kind.toUpperCase()} exported`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${kind.toUpperCase()} export failed`);
    }
  };

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
      {EXPORT_KINDS.map((kind) => (
        <Button
          key={kind}
          size="sm"
          variant="ghost"
          onPress={() => {
            void exportKind(kind);
          }}
        >
          {`Export ${kind.toUpperCase()}`}
        </Button>
      ))}
      {message === '' ? null : <span role="status">{message}</span>}
    </div>
  );
}
