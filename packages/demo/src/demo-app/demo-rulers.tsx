import type { EditorStore } from '@broadset/editor';
import { glassPanelStyle } from '@broadset/ui';
import { useMemo } from 'react';

import { RulerStrip } from '../demo-components';
import { RULER_SIZE } from '../demo-types';
import { useCanvasViewport } from './helpers';

interface DemoRulersProps {
  readonly editorStore: EditorStore;
  readonly documentCanvasWidth: number;
  readonly documentCanvasHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export function DemoRulers({
  editorStore,
  documentCanvasWidth,
  documentCanvasHeight,
  viewportWidth,
  viewportHeight,
}: DemoRulersProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);

  const horizontalTicks = useMemo(() => {
    const rulerLength = Math.max(viewportWidth - RULER_SIZE, 320);

    return Array.from({ length: 10 }, (_, index) => {
      const value = Math.round((documentCanvasWidth / 10) * index);

      return {
        label: String(value),
        position: (rulerLength / 10) * index * viewport.zoom + viewport.panX,
      };
    }).filter((tick) => tick.position >= -40 && tick.position <= rulerLength + 40);
  }, [documentCanvasWidth, viewport.panX, viewport.zoom, viewportWidth]);

  const verticalTicks = useMemo(() => {
    const rulerLength = Math.max(viewportHeight - RULER_SIZE, 240);

    return Array.from({ length: 8 }, (_, index) => {
      const value = Math.round((documentCanvasHeight / 8) * index);

      return {
        label: String(value),
        position: (rulerLength / 8) * index * viewport.zoom + viewport.panY,
      };
    }).filter((tick) => tick.position >= -40 && tick.position <= rulerLength + 40);
  }, [documentCanvasHeight, viewport.panY, viewport.zoom, viewportHeight]);

  return (
    <>
      <div
        className="absolute left-0 top-0 z-30"
        data-testid="ruler-corner"
        style={{ height: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
      >
        <div
          aria-hidden="true"
          style={{
            ...glassPanelStyle(),
            borderRadius: 0,
            height: '100%',
            width: '100%',
          }}
        />
      </div>

      <div
        className="absolute right-0 top-0 z-20"
        data-testid="ruler-horizontal-strip"
        style={{ height: `${String(RULER_SIZE)}px`, left: `${String(RULER_SIZE)}px` }}
      >
        <RulerStrip orientation="horizontal" ticks={horizontalTicks} />
      </div>

      <div
        className="absolute bottom-0 left-0 z-20"
        data-testid="ruler-vertical-strip"
        style={{ top: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
      >
        <RulerStrip orientation="vertical" ticks={verticalTicks} />
      </div>
    </>
  );
}
