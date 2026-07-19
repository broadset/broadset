import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import {
  pluginRendererKeyV1,
  type PluginRendererV1,
  type RenderContextV1,
  renderResolvedElementV1,
  type ResolvedRenderAssetV1,
} from './element-dom';
import type { PhysicalUnitContextV1 } from './physical-units';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const ELEMENT_ID = id('element');
const ROOT_ID = id('root');
const ASSET_ID = id('asset');
const PREVIEW_ID = id('preview');
const NO_SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const NO_FONTS: ReadonlyMap<projectFormatV1.Id, projectFormatV1.FontFamilyResource> = new Map();
const UNITS: PhysicalUnitContextV1 = { unit: 'mm', dpi: 254 };

function geometry(): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: 25.4,
    height: 12.7,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 2.54, 5.08] },
    origin: [1.27, 2.54, 0],
  });
}

function group(elementId = ELEMENT_ID): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: elementId,
    name: String(elementId),
    geometry: geometry(),
    kind: 'group',
  });
}

function node(
  element: projectFormatV1.Element,
  options: { readonly visible?: boolean; readonly path?: readonly projectFormatV1.Id[] } = {},
): projectFormatV1.ResolvedSceneNodeV1 {
  return {
    address: { rootInstanceId: ROOT_ID, componentInstancePath: options.path ?? [], elementId: element.id },
    parentAddress: null,
    sourceElement: element,
    element,
    localGeometry: element.geometry,
    worldGeometry: element.geometry,
    visible: options.visible ?? true,
    depth: 0,
    properties: [],
    fallbacks: [],
  };
}

function missing(): ResolvedRenderAssetV1 {
  return { status: 'missing', diagnostic: 'Asset unavailable' };
}

function context(
  resolveAsset: RenderContextV1['resolveAsset'] = missing,
  pluginRenderers?: RenderContextV1['pluginRenderers'],
): RenderContextV1 {
  return {
    swatches: NO_SWATCHES,
    fonts: NO_FONTS,
    resolveAsset,
    ...(pluginRenderers === undefined ? {} : { pluginRenderers }),
    document,
  };
}

function render(element: projectFormatV1.Element, renderContext = context()): HTMLElement {
  return renderResolvedElementV1({ node: node(element), context: renderContext, units: UNITS });
}

function baseKinds(): readonly projectFormatV1.Element[] {
  const emptyText: projectFormatV1.TextBody = { paragraphs: [] };
  const sourceBlob: projectFormatV1.BlobReference = {
    digest: projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`),
    byteLength: 0,
    mediaType: 'text/html',
    source: { kind: 'missing' },
  };

  return [
    projectFormatV1.createElementV1({
      id: id('text'),
      name: 'Text',
      geometry: geometry(),
      kind: 'text',
      text: emptyText,
    }),
    projectFormatV1.createElementV1({
      id: id('image'),
      name: 'Image',
      geometry: geometry(),
      kind: 'image',
      image: { assetId: ASSET_ID, fit: 'cover' },
    }),
    projectFormatV1.createElementV1({
      id: id('vector'),
      name: 'Vector',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    }),
    group(id('group')),
    projectFormatV1.createElementV1({
      id: id('component'),
      name: 'Component',
      geometry: geometry(),
      kind: 'component-instance',
      componentId: id('definition'),
    }),
    projectFormatV1.createElementV1({
      id: id('video'),
      name: 'Video',
      geometry: geometry(),
      kind: 'video',
      video: { assetId: ASSET_ID, fit: 'contain', autoplay: false, loop: true, muted: true, controls: false },
    }),
    projectFormatV1.createElementV1({
      id: id('audio'),
      name: 'Audio',
      geometry: geometry(),
      kind: 'audio',
      audio: { assetId: ASSET_ID, autoplay: false, loop: false, volume: 0.5 },
    }),
    projectFormatV1.createElementV1({
      id: id('clock'),
      name: 'Clock',
      geometry: geometry(),
      kind: 'clock',
      clock: { format: 'HH:mm', timeZone: 'UTC' },
    }),
    projectFormatV1.createElementV1({
      id: id('ticker'),
      name: 'Ticker',
      geometry: geometry(),
      kind: 'ticker',
      ticker: { items: [{ id: id('item'), text: 'Headline' }], direction: 'left', speed: 40, gap: 2.54, repeat: true },
    }),
    projectFormatV1.createElementV1({
      id: id('qr'),
      name: 'QR',
      geometry: geometry(),
      kind: 'qrcode',
      qrcode: { value: 'https://example.test', errorCorrection: 'M', quietZone: 4 },
    }),
    projectFormatV1.createElementV1({
      id: id('foreign'),
      name: 'Foreign',
      geometry: geometry(),
      kind: 'foreign',
      foreign: {
        mediaType: 'text/html',
        sourceBlob,
        previewAssetId: PREVIEW_ID,
        safeRenderMode: 'preview-only',
        reason: '<script>alert(1)</script>',
      },
    }),
    projectFormatV1.createElementV1({
      id: id('plugin'),
      name: 'Plugin',
      geometry: geometry(),
      kind: 'plugin',
      plugin: {
        pluginId: 'trusted.example',
        elementType: 'chart',
        schemaVersion: 1,
        payload: { html: '<img onerror=alert(1)>' },
      },
    }),
  ];
}

describe('renderResolvedElementV1', () => {
  it('applies converted local geometry and exact renderer-owned attributes', () => {
    const element = group();
    const host = renderResolvedElementV1({ node: node(element, { visible: false }), context: context(), units: UNITS });

    expect(host.dataset['elementId']).toBe(ELEMENT_ID);
    expect(host.dataset['instanceRootId']).toBe(ROOT_ID);
    expect(host.dataset['componentInstancePath']).toBe('[]');
    expect(host.dataset['visibility']).toBe('offscreen');
    expect(host.hasAttribute('data-opacity-target')).toBe(true);
    expect(host.matches('[data-element-content]')).toBe(true);
    expect(host.querySelectorAll('[data-element-content]')).toHaveLength(0);
    expect(host.classList.contains('offscreen')).toBe(true);
    expect(host.style.left).toBe('0px');
    expect(host.style.top).toBe('0px');
    expect(host.style.width).toBe('254px');
    expect(host.style.transform).toBe('matrix(1, 0, 0, 1, 25.4, 50.8)');
  });

  it('gives every closed element kind exactly one semantic content target or visible inert fallback', () => {
    for (const element of baseKinds()) {
      const host = render(element);
      const targets = [
        ...(host.matches('[data-element-content]') ? [host] : []),
        ...host.querySelectorAll<HTMLElement>('[data-element-content]'),
      ];

      expect(targets, element.kind).toHaveLength(1);
    }
  });

  it('renders every vector subtype, including composed boolean operands', () => {
    const pathId = id('point');
    const vectors: readonly projectFormatV1.VectorGeometryData[] = [
      projectFormatV1.createRectangleGeometry([1, 2, 3, 4]),
      projectFormatV1.createEllipseGeometry(),
      {
        kind: 'path',
        fillRule: 'nonzero',
        path: {
          points: [{ id: pathId, x: 1, y: 2 }],
          segments: [{ id: id('move'), kind: 'move', pointId: pathId }],
          closed: false,
        },
      },
    ];

    expect(
      vectors.map(
        (geometryData) =>
          render(
            projectFormatV1.createElementV1({
              id: ELEMENT_ID,
              name: geometryData.kind,
              geometry: geometry(),
              kind: 'vector',
              geometryData,
            }),
          ).textContent,
      ),
    ).toEqual(['', '', '']);

    const operandA = projectFormatV1.createElementV1({
      id: id('operand-a'),
      name: 'Operand A',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    });
    const operandB = projectFormatV1.createElementV1({
      id: id('operand-b'),
      name: 'Operand B',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createEllipseGeometry(),
    });
    const boolean = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Boolean',
      geometry: geometry(),
      kind: 'vector',
      geometryData: { kind: 'boolean', operation: 'subtract', operandIds: [operandA.id, operandB.id] },
    });

    if (operandA.kind !== 'vector' || operandB.kind !== 'vector') throw new Error('Expected vector operands');

    const booleanHost = renderResolvedElementV1({
      node: node(boolean),
      context: context(),
      units: UNITS,
      vectorOperands: new Map([
        [operandA.id, operandA],
        [operandB.id, operandB],
      ]),
    });

    expect(booleanHost.textContent).toBe('');
    expect(booleanHost.querySelector('[data-boolean-combined="subtract"]')).not.toBeNull();
  });

  it('clips ordered solid and gradient fill layers to structured path geometry', () => {
    const pointA = id('point-a');
    const pointB = id('point-b');
    const red: projectFormatV1.ConcreteColorValue = {
      kind: 'color',
      space: 'srgb',
      channels: [1, 0, 0],
      alpha: 1,
    };
    const gradient: projectFormatV1.Gradient = {
      kind: 'linear',
      start: [0, 0],
      end: [1, 0],
      stops: [
        { id: id('stop-a'), color: red, opacity: 1, offset: 0 },
        { id: id('stop-b'), color: { ...red, channels: [0, 0, 1] }, opacity: 1, offset: 1 },
      ],
      coordinateSpace: 'object-bounds',
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      spread: 'pad',
      interpolation: 'srgb',
    };
    const path = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Layered path',
      geometry: geometry(),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          { id: id('solid'), enabled: true, opacity: 0.5, blendMode: 'multiply', paint: { kind: 'solid', color: red } },
          {
            id: id('gradient'),
            enabled: true,
            opacity: 0.75,
            blendMode: 'screen',
            paint: { kind: 'gradient', gradient },
          },
        ],
      },
      kind: 'vector',
      geometryData: {
        kind: 'path',
        fillRule: 'nonzero',
        path: {
          points: [
            { id: pointA, x: 0, y: 0 },
            { id: pointB, x: 20, y: 20 },
          ],
          segments: [
            { id: id('move-a'), kind: 'move', pointId: pointA },
            { id: id('line-b'), kind: 'line', pointId: pointB },
            { id: id('close'), kind: 'close' },
          ],
          closed: true,
        },
      },
    });
    const host = render(path);
    const content = host.querySelector<HTMLElement>('[data-element-content]');
    const paints = host.querySelectorAll<HTMLElement>('[data-paint-layer]');

    expect(host.querySelector('[data-vector-path="true"]')).not.toBeNull();
    expect(content?.style.width).toBe('100%');
    expect(content?.style.height).toBe('100%');
    expect(Array.from(paints, (paint) => paint.dataset['paintLayer'])).toEqual(['solid', 'gradient']);
    expect(paints[0]?.style.backgroundImage).toContain('color-mix');
    expect(paints[0]?.style.mixBlendMode).toBe('multiply');
    expect(paints[1]?.style.backgroundImage).toContain('linear-gradient(90deg');
    expect(paints[1]?.style.mixBlendMode).toBe('screen');
  });

  it('converts rectangle radii, text padding/spacing, and ticker gap', () => {
    const paragraph: projectFormatV1.ParagraphProperties = {
      ...projectFormatV1.createParagraphProperties(),
      lineSpacing: { kind: 'absolute', value: 2.54 },
    };
    const run: projectFormatV1.RunProperties = {
      ...projectFormatV1.createRunProperties({ fontFamilyId: id('font'), fontFaceId: id('face'), size: 2.54 }),
      tracking: 0.254,
    };
    const text = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Text',
      geometry: geometry(),
      kind: 'text',
      text: {
        paragraphs: [
          { id: id('paragraph'), properties: paragraph, runs: [{ id: id('run'), text: 'Safe', properties: run }] },
        ],
      },
      layout: {
        verticalAlignment: 'top',
        overflow: 'visible',
        autoSize: 'none',
        columns: 1,
        columnGap: 1.27,
        padding: [1, 2, 3, 4],
      },
    });
    const rectangle = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Rectangle',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry([1, 2, 3, 4]),
    });
    const ticker = baseKinds().find((element) => element.kind === 'ticker');

    expect(render(text).querySelector<HTMLElement>('[data-element-content]')?.style.padding).toBe(
      '10px 20px 30px 40px',
    );
    expect(render(text).querySelector('span')?.style.fontSize).toBe('25.4px');
    expect(render(text).querySelector<HTMLElement>('[data-element-content] > div')?.style.lineHeight).toBe('25.4px');

    const rectanglePath = render(rectangle).querySelector<SVGPathElement>('[data-vector-path]')?.getAttribute('d');

    expect(rectanglePath).toContain('A 1 1');
    expect(rectanglePath).toContain('A 2 2');
    expect(rectanglePath).toContain('A 3 3');
    expect(rectanglePath).toContain('A 4 4');
    expect(
      ticker === undefined ? undefined : (
        render(ticker).querySelector<HTMLElement>('[data-element-content] > div')?.style.gap
      ),
    ).toBe('25.4px');
  });

  it('renders deterministic realtime clocks, inert ticker items, and SVG QR symbols', () => {
    const clock = baseKinds().find((element) => element.kind === 'clock');
    const ticker = baseKinds().find((element) => element.kind === 'ticker');
    const qr = baseKinds().find((element) => element.kind === 'qrcode');

    if (clock?.kind !== 'clock' || ticker?.kind !== 'ticker' || qr?.kind !== 'qrcode')
      throw new Error('Expected semantic fixtures');

    const clockHost = render(clock, {
      ...context(),
      clock: { now: () => new Date('2026-07-14T12:34:56.789Z') },
    });
    const unavailableClock = render(clock);
    const tickerHost = render(ticker);
    const tickerTrack = tickerHost.querySelector<HTMLElement>('[data-ticker-direction]');
    const qrSvg = render(qr).querySelector('svg');

    expect(clockHost.textContent).toBe('12:34');
    expect(unavailableClock.textContent).toContain('Realtime clock unavailable');
    expect(tickerTrack?.style.animationName).toBe('');
    expect(tickerTrack?.querySelectorAll('span')).toHaveLength(1);
    expect(tickerTrack?.querySelector('span')?.dataset['tickerItemId']).toBe('item');
    expect(qrSvg?.getAttribute('viewBox')).toBe('0 0 25 25');
    expect(qrSvg?.style.padding).toBe('40px');
    expect(qrSvg?.querySelector('[data-qr-modules="25"]')?.getAttribute('d')?.length).toBeGreaterThan(100);
  });

  it('renders ready assets and visible missing, throwing, and broken-image fallbacks', () => {
    const image = baseKinds().find((element) => element.kind === 'image');

    if (image === undefined) throw new Error('Expected image fixture');

    const ready = render(
      image,
      context((): ResolvedRenderAssetV1 => ({ status: 'ready', url: 'https://assets.example/image.png' })),
    );
    const unavailable = render(image);
    const throwing = render(
      image,
      context((): ResolvedRenderAssetV1 => {
        throw new Error('resolver failed');
      }),
    );
    const readyImage = ready.querySelector('img');

    readyImage?.dispatchEvent(new Event('error'));

    expect(ready.textContent).toContain('Image could not be displayed');
    expect(unavailable.textContent).toContain('Asset unavailable');
    expect(unavailable.querySelector<HTMLElement>('.broadset-render-fallback')?.style.objectFit).toBe('cover');
    expect(throwing.textContent).toContain('Asset unavailable');
  });

  it('uses only an explicitly registered plugin renderer and never interprets foreign/plugin payload HTML', () => {
    const plugin = baseKinds().find((element) => element.kind === 'plugin');
    const foreign = baseKinds().find((element) => element.kind === 'foreign');

    if (plugin?.kind !== 'plugin' || foreign?.kind !== 'foreign') throw new Error('Expected fixtures');

    const renderPlugin = (options: {
      readonly element: projectFormatV1.PluginElement;
      readonly document: Document;
    }): HTMLElement => {
      const result = options.document.createElement('strong');

      result.textContent = 'Authorized plugin';

      return result;
    };
    const renderSpy = vi.fn(renderPlugin);
    const renderer: PluginRendererV1 = { render: renderSpy };
    const key = pluginRendererKeyV1(plugin.plugin);
    const authorized = render(plugin, context(missing, new Map([[key, renderer]])));
    const inertPlugin = render(plugin);
    const inertForeign = render(foreign);

    expect(authorized.textContent).toBe('Authorized plugin');
    expect(renderSpy).toHaveBeenCalledOnce();
    expect(inertPlugin.querySelector('img')).toBeNull();
    expect(inertForeign.querySelector('script')).toBeNull();
    expect(inertPlugin.textContent).toContain('Unsupported plugin');
  });

  it('requires exact plugin type/version authorization and rejects unusable adapter output', () => {
    const plugin = baseKinds().find((element) => element.kind === 'plugin');

    if (plugin?.kind !== 'plugin') throw new Error('Expected plugin fixture');

    const renderPlugin = vi.fn(
      ({
        document: domDocument,
      }: {
        readonly element: projectFormatV1.PluginElement;
        readonly document: Document;
      }): HTMLElement => domDocument.createElement('strong'),
    );
    const renderer: PluginRendererV1 = { render: renderPlugin };
    const wrongKey = pluginRendererKeyV1({ ...plugin.plugin, schemaVersion: plugin.plugin.schemaVersion + 1 });
    const wrongVersion = render(plugin, context(missing, new Map([[wrongKey, renderer]])));
    const exactKey = pluginRendererKeyV1(plugin.plugin);

    Object.defineProperty(renderer, 'render', { configurable: true, value: (): string => '<script>bad()</script>' });

    const unusable = render(plugin, context(missing, new Map([[exactKey, renderer]])));

    expect(wrongVersion.textContent).toContain('Unsupported plugin');
    expect(renderPlugin).not.toHaveBeenCalled();
    expect(unusable.querySelector('script')).toBeNull();
    expect(unusable.textContent).toContain('Unsupported plugin');
  });
});
