import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  gradientFill,
  rgbColor,
  solidFill,
} from '@broadset/model';
import type { TimelineFrame } from '@broadset/playback';
import { describe, expect, it } from 'vitest';

import { composePreviewDocumentWithRuntimeOverlay, type RuntimeTimelineOverlay } from './preview-runtime-overlay';

function createDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    elements,
  };
}

function createFrame(
  properties: Readonly<Record<string, unknown>>,
  targetProperties: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
  childFrames: Readonly<Record<string, TimelineFrame>> = {},
): TimelineFrame {
  return {
    timelineId: 'timeline-1',
    timelineName: 'Timeline 1',
    timeMs: 500,
    durationMs: 1000,
    properties,
    targetProperties,
    activeState: null,
    modifiers: new Set(),
    childFrames,
  };
}

describe('preview runtime overlay composition', () => {
  /** @description Timeline preview overlays must be ephemeral so base property edits do not inherit animation-applied opacity. */
  it('applies owner opacity without mutating the base document', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { opacity: 0.5, fill: solidFill(rgbColor('#ff0000')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ opacity: 0.25 }),
    };
    const previewDocument = composePreviewDocumentWithRuntimeOverlay(document, overlay);

    expect(previewDocument.elements[0]?.style.opacity).toBe(0.25);
    expect(document.elements[0]?.style.opacity).toBe(0.5);
    expect(previewDocument).not.toBe(document);
    expect(previewDocument.elements[0]).not.toBe(document.elements[0]);
  });

  /** @description Child-target keyframes must apply to the child element only, preserving parent base styles during layer visibility edits. */
  it('applies target properties to child elements without rewriting parent base style', () => {
    const parent = createDefaultElement('group', {
      id: 'parent',
      style: { opacity: 0.5, fill: solidFill(rgbColor('#0000ff')) },
    });
    const child = createDefaultElement('rectangle', {
      id: 'child',
      parentId: 'parent',
      style: { opacity: 1, fill: solidFill(rgbColor('#00ff00')) },
    });
    const document = createDocument([parent, child]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'parent',
      frame: createFrame({ opacity: 0.75 }, { child: { opacity: 0 } }),
    };
    const previewDocument = composePreviewDocumentWithRuntimeOverlay(document, overlay);

    expect(previewDocument.elements.find((entry) => entry.id === 'parent')?.style.opacity).toBe(0.75);
    expect(previewDocument.elements.find((entry) => entry.id === 'child')?.style.opacity).toBe(0);
    expect(document.elements.find((entry) => entry.id === 'parent')?.style.opacity).toBe(0.5);
    expect(document.elements.find((entry) => entry.id === 'child')?.style.opacity).toBe(1);
  });

  /** @description Child timeline frames must compose into the child element so editor scrub matches nested animation playback. */
  it('applies child timeline frames to child elements', () => {
    const parent = createDefaultElement('group', {
      id: 'parent',
      style: { opacity: 1, fill: solidFill(rgbColor('#0000ff')) },
    });
    const child = createDefaultElement('rectangle', {
      id: 'child',
      parentId: 'parent',
      position: { x: 10, y: 20 },
      style: { opacity: 1, fill: solidFill(rgbColor('#00ff00')) },
    });
    const document = createDocument([parent, child]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'parent',
      frame: createFrame({}, {}, { child: createFrame({ opacity: 0.4, translateX: 12 }) }),
    };
    const previewChild = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements.find(
      (entry) => entry.id === 'child',
    );

    expect(previewChild?.style.opacity).toBe(0.4);
    expect(previewChild?.position.x).toBe(22);
    expect(document.elements.find((entry) => entry.id === 'child')?.style.opacity).toBe(1);
  });

  /** @description Geometry keyframes authored from the property panel are absolute model values; only translateX/Y are relative offsets. */
  it('composes absolute position and rotation keyframes without adding the base transform', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      position: { x: 100, y: 200 },
      rotation: 30,
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ x: 150, y: 250, rotation: 45 }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.position).toEqual({ x: 150, y: 250 });
    expect(previewElement?.rotation).toBe(45);
    expect(document.elements[0]?.position).toEqual({ x: 100, y: 200 });
    expect(document.elements[0]?.rotation).toBe(30);
  });

  /** @description Relative translate keyframes still layer over the element's base position for motion offsets. */
  it('composes translate keyframes as relative offsets from the base position', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      position: { x: 100, y: 200 },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ translateX: 12, translateY: -8 }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.position).toEqual({ x: 112, y: 192 });
    expect(document.elements[0]?.position).toEqual({ x: 100, y: 200 });
  });

  /** @description Scrub preview must match playback when absolute x/y and relative translate offsets are authored in the same frame, regardless of property order. */
  it.each([
    ['absolute values first', { x: 150, y: 250, translateX: 12, translateY: -8 }],
    ['relative values first', { translateX: 12, translateY: -8, x: 150, y: 250 }],
  ])('composes mixed absolute and relative position keyframes with %s', (_label, properties) => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      position: { x: 100, y: 200 },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame(properties),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.position).toEqual({ x: 162, y: 242 });
  });

  /** @description 3D transform keyframes must compose into model style fields so canvas scrub matches renderer output. */
  it('composes 3D transform keyframes into style fields', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { rotateX: 5, rotateY: 10, rotateZ: 15, translateZ: 20 },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ rotateX: 30, rotateY: 45, rotateZ: 60, translateZ: 90 }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.rotateX).toBe(30);
    expect(previewElement?.style.rotateY).toBe(45);
    expect(previewElement?.style.rotateZ).toBe(60);
    expect(previewElement?.style.translateZ).toBe(90);
    expect(document.elements[0]?.style.rotateX).toBe(5);
  });

  /** @description Gradient keyframe property paths must compose over the base fill instead of replacing solid fills unexpectedly. */
  it('applies gradient property paths over the base gradient fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: {
        fill: gradientFill({
          type: 'linear',
          angle: 45,
          stops: [
            { color: rgbColor('#ff0000'), position: 0 },
            { color: rgbColor('#0000ff'), position: 100 },
          ],
        }),
      },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({
        'backgroundGradient.angle': 90,
        'backgroundGradient.stops[1].position': 75,
      }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(
      gradientFill({
        type: 'linear',
        angle: 90,
        stops: [
          { color: rgbColor('#ff0000'), position: 0 },
          { color: rgbColor('#0000ff'), position: 75 },
        ],
      }),
    );
    expect(document.elements[0]?.style.fill).toEqual(element.style.fill);
  });

  /** @description Whole-gradient keyframes emitted by the gradient editor must compose into model gradient fills, not get ignored as unknown CSS. */
  it('applies whole backgroundGradient strings to the preview fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { fill: solidFill(rgbColor('#ffffff')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: 'linear-gradient(135deg, #112233 10%, #445566 90%)' }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(
      gradientFill({
        type: 'linear',
        angle: 135,
        stops: [
          { color: rgbColor('#112233'), position: 10 },
          { color: rgbColor('#445566'), position: 90 },
        ],
      }),
    );
  });

  /** @description Whole linear-gradient keyframes with CSS direction syntax must compose instead of being dropped by the preview-only path. */
  it('applies whole linear backgroundGradient strings with direction syntax to the preview fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { fill: solidFill(rgbColor('#ffffff')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: 'linear-gradient(to right, red 0%, blue 100%)' }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(
      gradientFill({
        type: 'linear',
        angle: 90,
        stops: [
          { color: rgbColor('#ff0000'), position: 0 },
          { color: rgbColor('#0000ff'), position: 100 },
        ],
      }),
    );
  });

  /** @description Whole gradients with CSS color hints cannot be represented in the model preview fill and must be left for the DOM fallback path. */
  it('does not corrupt whole backgroundGradient strings with CSS color hints', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { fill: solidFill(rgbColor('#ffffff')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: 'linear-gradient(90deg, green 0%, 40%, yellow 100%)' }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(element.style.fill);
  });

  /** @description Whole radial-gradient keyframes emitted by the model serializer must compose into model gradient fills. */
  it('applies whole radial backgroundGradient strings to the preview fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { fill: solidFill(rgbColor('#ffffff')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: 'radial-gradient(circle at 25% 75%, #112233 0%, #445566 100%)' }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(
      gradientFill({
        type: 'radial',
        center: [25, 75],
        stops: [
          { color: rgbColor('#112233'), position: 0 },
          { color: rgbColor('#445566'), position: 100 },
        ],
      }),
    );
  });

  /** @description Whole conic-gradient keyframes emitted by the model serializer must compose into model gradient fills. */
  it('applies whole conic backgroundGradient strings to the preview fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: { fill: solidFill(rgbColor('#ffffff')) },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({
        backgroundGradient: 'conic-gradient(from 45deg at 25% 75%, #112233 0%, #445566 100%)',
      }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(
      gradientFill({
        type: 'conic',
        startAngle: 45,
        center: [25, 75],
        stops: [
          { color: rgbColor('#112233'), position: 0 },
          { color: rgbColor('#445566'), position: 100 },
        ],
      }),
    );
  });

  /** @description Clearing a whole-gradient keyframe falls back to the element's solid color equivalent instead of leaving a stale gradient. */
  it('clears whole backgroundGradient strings to a solid fill', () => {
    const element = createDefaultElement('rectangle', {
      id: 'root',
      style: {
        fill: gradientFill({
          type: 'linear',
          angle: 90,
          stops: [
            { color: rgbColor('#112233'), position: 0 },
            { color: rgbColor('#445566'), position: 100 },
          ],
        }),
      },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: '' }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.style.fill).toEqual(solidFill(rgbColor('#112233')));
    expect(document.elements[0]?.style.fill).toEqual(element.style.fill);
  });

  /** @description Path and trim-path keyframes map to persisted model fields, so preview composition can match renderer output without DOM mutation. */
  it('applies path data and trim-path properties to path elements', () => {
    const element = createDefaultElement('path', {
      id: 'path',
      content: 'M0,0 L10,0',
      style: { trimStart: 0, trimEnd: 1, trimOffset: 0 },
    });
    const document = createDocument([element]);
    const overlay: RuntimeTimelineOverlay = {
      elementId: 'path',
      frame: createFrame({ d: 'M0,0 L20,0', trimStart: 0.25, trimEnd: 0.75, trimOffset: 0.1 }),
    };
    const previewElement = composePreviewDocumentWithRuntimeOverlay(document, overlay).elements[0];

    expect(previewElement?.content).toBe('M0,0 L20,0');
    expect(previewElement?.style.trimStart).toBe(0.25);
    expect(previewElement?.style.trimEnd).toBe(0.75);
    expect(previewElement?.style.trimOffset).toBe(0.1);
    expect(document.elements[0]?.content).toBe('M0,0 L10,0');
  });
});
