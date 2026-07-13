import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';

describe('V1DemoCanvasSurface', () => {
  it('renders the active v1 page through project-store viewport state', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const { container } = render(
      <V1DemoCanvasSurface
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        editorStore={store}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );
    const viewport = container.querySelector<HTMLElement>('[data-testid="v1-canvas-viewport"]');

    expect(container.querySelector('[data-element-id="el-scorebug"]')).not.toBeNull();
    expect(viewport?.style.transform).toBe('translate(0px, 0px) scale(1)');

    act(() => {
      store.getState().updateCanvasSettings({ panX: 24, panY: -12, zoom: 1.5 });
    });

    expect(viewport?.style.transform).toBe('translate(24px, -12px) scale(1.5)');
  });
});
