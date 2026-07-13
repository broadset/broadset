import type { ProjectEditorStore } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';

import { V1PagePreview } from '../demo-components/v1-page-preview';
import { useCanvasViewport } from './helpers';

interface V1DemoCanvasSurfaceProps {
  readonly editorStore: ProjectEditorStore;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}

export function V1DemoCanvasSurface({
  editorStore,
  project,
  documentId,
  pageId,
}: V1DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);

  return (
    <div
      data-testid="v1-canvas-surface"
      style={{ inset: 0, overflow: 'hidden', perspective: viewport.perspective, position: 'absolute' }}
    >
      <div
        data-testid="v1-canvas-viewport"
        style={{
          transform: `translate(${String(viewport.panX)}px, ${String(viewport.panY)}px) scale(${String(viewport.zoom)})`,
          transformOrigin: '0 0',
        }}
      >
        <V1PagePreview documentId={documentId} pageId={pageId} project={project} />
      </div>
    </div>
  );
}
