import { describe, expect, it } from 'vitest';

import { schemaParityWitnessRegistry } from './fixtures/schema-parity-witnesses';
import { broadsetProjectV1Schema, parseProjectV1Unknown } from './index';

const picture = {
  kind: 'picture' as const,
  assetId: 'picture-asset',
  fit: 'cover' as const,
  crop: { x: 0.4, y: 0.4, width: 0.7, height: 0.7 },
};

function vectorProject() {
  const family = schemaParityWitnessRegistry.find(({ family: name }) => name === 'element');
  const variant = family?.variants.find(({ discriminant }) => discriminant === 'vector');

  if (variant === undefined) throw new Error('Vector witness is required');

  return broadsetProjectV1Schema.parse(variant.project());
}

describe('picture paint normalized extents', () => {
  it('rejects overflowing picture crops at every persisted paint occurrence family', () => {
    const project = vectorProject();
    const document = project.documents[0];
    const element = document?.elements[0];

    if (document === undefined || element?.kind !== 'vector') throw new Error('Vector witness is required');

    const decorated = {
      ...element,
      appearance: {
        ...element.appearance,
        fills: [{ id: 'fill', enabled: true, opacity: 1, blendMode: 'normal' as const, paint: picture }],
        strokes: [{ id: 'stroke', enabled: true, opacity: 1, blendMode: 'normal' as const, paint: picture, width: 1, alignment: 'center' as const, cap: 'butt' as const, join: 'miter' as const, miterLimit: 4, dash: [], dashOffset: 0 }],
      },
    };
    const componentElement = { ...decorated, id: 'component-vector' };
    const input = {
      ...project,
      documents: [{
        ...document,
        surface: { ...document.surface, background: picture },
        elements: [decorated],
        components: [{ id: 'component', name: 'Component', elements: [componentElement], rootElementIds: ['component-vector'], sequences: [], exposedProperties: [], extensions: [] }],
      }],
    };
    const result = parseProjectV1Unknown(input);
    const pointers = result.diagnostics.filter(({ code }) => code === 'appearance.invalid-rect').map(({ pointer }) => pointer);

    expect(result.status).toBe('quarantined');
    expect(pointers).toEqual(expect.arrayContaining([
      '/documents/0/surface/background/crop',
      '/documents/0/elements/0/appearance/fills/0/paint/crop',
      '/documents/0/elements/0/appearance/strokes/0/paint/crop',
      '/documents/0/components/0/elements/0/appearance/fills/0/paint/crop',
      '/documents/0/components/0/elements/0/appearance/strokes/0/paint/crop',
    ]));
  });
});
