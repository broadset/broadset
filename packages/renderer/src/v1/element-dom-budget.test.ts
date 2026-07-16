import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { type RenderContextV1, renderResolvedElementV1 } from './element-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const ELEMENT_ID = id('element');
const ROOT_ID = id('root');

function geometry(): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({ width: 100, height: 50 });
}

function node(element: projectFormatV1.Element): projectFormatV1.ResolvedSceneNodeV1 {
  return {
    address: { rootInstanceId: ROOT_ID, componentInstancePath: [], elementId: element.id },
    parentAddress: null,
    sourceElement: element,
    element,
    localGeometry: element.geometry,
    worldGeometry: element.geometry,
    visible: true,
    depth: 0,
    properties: [],
    fallbacks: [],
  };
}

function context(): RenderContextV1 {
  return {
    swatches: new Map(),
    fonts: new Map(),
    resolveAsset: () => ({ status: 'missing', diagnostic: 'Unavailable' }),
    document,
  };
}

describe('resolved element output budgets', () => {
  it('bounds QR encoding, ticker DOM expansion, and boolean operand output', () => {
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    const oversizedQr = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Oversized QR',
      geometry: geometry(),
      kind: 'qrcode',
      qrcode: { value: 'x'.repeat(1_000_000), errorCorrection: 'L', quietZone: 4 },
    });
    const excessiveTicker = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Excessive ticker',
      geometry: geometry(),
      kind: 'ticker',
      ticker: {
        items: Array.from({ length: 1_000 }, (_, index) => ({
          id: id(`item-${String(index)}`),
          text: 'Headline',
        })),
        direction: 'left',
        speed: 40,
        gap: 1,
        repeat: true,
      },
    });
    const operandIds: projectFormatV1.Id[] = [];
    const operands = new Map<projectFormatV1.Id, projectFormatV1.VectorElement>();

    for (let index = 0; index < 65; index += 1) {
      const operandId = id(`operand-${String(index)}`);
      const operand = projectFormatV1.createElementV1({
        id: operandId,
        name: String(operandId),
        geometry: geometry(),
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      });

      if (operand.kind !== 'vector') throw new Error('Expected vector operand');
      operandIds.push(operandId);
      operands.set(operandId, operand);
    }

    const excessiveBoolean = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Excessive boolean',
      geometry: geometry(),
      kind: 'vector',
      geometryData: { kind: 'boolean', operation: 'intersect', operandIds },
    });
    const render = (element: projectFormatV1.Element): HTMLElement =>
      renderResolvedElementV1({ node: node(element), context: context(), units: { unit: 'px', dpi: 96 } });
    const qrHost = render(oversizedQr);
    const tickerHost = render(excessiveTicker);
    const booleanHost = renderResolvedElementV1({
      node: node(excessiveBoolean),
      context: context(),
      units: { unit: 'px', dpi: 96 },
      vectorOperands: operands,
    });

    expect(encode).not.toHaveBeenCalled();
    expect(qrHost.textContent).toContain('QR content exceeds');
    expect(tickerHost.textContent).not.toContain('Ticker item budget exceeded');
    expect(tickerHost.querySelectorAll('span')).toHaveLength(64);
    expect(booleanHost.textContent).toContain('Boolean operand budget exceeded');
    expect(booleanHost.querySelector('svg')).toBeNull();
  });

  it('rejects excessive appearance output before composing CSS, DOM, or asset resolutions', () => {
    const resolveAsset = vi.fn<RenderContextV1['resolveAsset']>(() => ({ status: 'ready', url: 'blob:paint' }));
    const fills: projectFormatV1.FillLayer[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: id(`fill-${String(index)}`),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      paint: { kind: 'picture', assetId: id(`asset-${String(index)}`), fit: 'cover' },
    }));
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Excessive appearance',
      geometry: geometry(),
      appearance: { ...projectFormatV1.createDefaultAppearance(), fills },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
    const host = renderResolvedElementV1({
      node: node(element),
      context: { ...context(), resolveAsset },
      units: { unit: 'px', dpi: 96 },
    });

    expect(host.textContent).toContain('Appearance output budget exceeded');
    expect(host.querySelectorAll('[data-paint-layer]')).toHaveLength(0);
    expect(resolveAsset).not.toHaveBeenCalled();
  });
});
