import type { ProjectEditorStore } from '@broadset/editor';
import type { PhysicalUnitContextV1 } from '@broadset/renderer';
import { useMemo } from 'react';

import { RulerStrip } from '../demo-components';
import { useCanvasViewport, useEditorSelector } from './helpers';
import { documentValueToCssPixelsV1 } from './v1-canvas-units';

interface V1RulersProps {
  readonly editorStore: ProjectEditorStore;
  readonly surfaceSize: readonly [number, number];
  readonly units: PhysicalUnitContextV1;
}

const RULER_SIZE = 20;

function createTicks(options: {
  readonly count: number;
  readonly offset: number;
  readonly scale: number;
  readonly surfaceLength: number;
  readonly units: PhysicalUnitContextV1;
}): readonly { readonly label: string; readonly position: number }[] {
  return Array.from({ length: options.count }, (_, index) => {
    const value = Math.round((options.surfaceLength / options.count) * index);

    return {
      label: String(value),
      position: documentValueToCssPixelsV1(value, options.units) * options.scale + options.offset,
    };
  });
}

export function V1Rulers({ editorStore, surfaceSize, units }: V1RulersProps): React.JSX.Element | null {
  const visible = useEditorSelector(editorStore, (state) => state.canvasSettings.showRulers);
  const viewport = useCanvasViewport(editorStore);
  const horizontalTicks = useMemo(
    () =>
      createTicks({
        count: 10,
        offset: viewport.panX,
        scale: viewport.zoom,
        surfaceLength: surfaceSize[0],
        units,
      }),
    [surfaceSize, units, viewport.panX, viewport.zoom],
  );
  const verticalTicks = useMemo(
    () =>
      createTicks({
        count: 8,
        offset: viewport.panY,
        scale: viewport.zoom,
        surfaceLength: surfaceSize[1],
        units,
      }),
    [surfaceSize, units, viewport.panY, viewport.zoom],
  );

  if (!visible) return null;

  return (
    <div aria-hidden="true" style={{ inset: 0, pointerEvents: 'none', position: 'absolute', zIndex: 20 }}>
      <div
        data-testid="ruler-corner"
        style={{ background: 'rgba(20, 20, 20, 0.72)', height: RULER_SIZE, width: RULER_SIZE }}
      />
      <div
        data-testid="ruler-horizontal-strip"
        style={{ height: RULER_SIZE, left: RULER_SIZE, position: 'absolute', right: 0, top: 0 }}
      >
        <RulerStrip orientation="horizontal" ticks={horizontalTicks} />
      </div>
      <div
        data-testid="ruler-vertical-strip"
        style={{ bottom: 0, left: 0, position: 'absolute', top: RULER_SIZE, width: RULER_SIZE }}
      >
        <RulerStrip orientation="vertical" ticks={verticalTicks} />
      </div>
    </div>
  );
}
