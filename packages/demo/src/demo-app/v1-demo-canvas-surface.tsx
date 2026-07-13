import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { V1PagePreview } from '../demo-components/v1-page-preview';
import { useCanvasViewport } from './helpers';

const EMPTY_BLOBS: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map();

interface V1DemoCanvasSurfaceProps {
  readonly editorStore: ProjectEditorStore;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}

function readElementId(target: EventTarget | null): projectFormatV1.Id | undefined {
  if (!(target instanceof Element)) return undefined;

  const value = target.closest<HTMLElement>('[data-element-id]')?.dataset['elementId'];

  if (value === undefined) return undefined;

  const result = projectFormatV1.idSchema.safeParse(value);

  return result.success ? result.data : undefined;
}

export function V1DemoCanvasSurface({
  editorStore,
  project,
  blobs = EMPTY_BLOBS,
  documentId,
  pageId,
}: V1DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const elementId = readElementId(event.target);

    if (elementId === undefined) return;

    const state = editorStore.getState();

    if (event.ctrlKey || event.metaKey || event.shiftKey) state.toggleSelectElement(elementId);
    else state.selectElement(elementId);
  };

  return (
    <div
      data-testid="v1-canvas-surface"
      onPointerDown={handlePointerDown}
      style={{ inset: 0, overflow: 'hidden', perspective: viewport.perspective, position: 'absolute' }}
    >
      <div
        data-testid="v1-canvas-viewport"
        style={{
          transform: `translate(${String(viewport.panX)}px, ${String(viewport.panY)}px) scale(${String(viewport.zoom)})`,
          transformOrigin: '0 0',
        }}
      >
        <V1PagePreview blobs={blobs} documentId={documentId} pageId={pageId} project={project} />
      </div>
    </div>
  );
}
