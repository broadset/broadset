import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { type RenderContextV1, renderElementV1 } from './element-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const ELEMENT_ID = id('element');
const ASSET_ID = id('asset');
const FONT_FAMILY_ID = id('font-family');
const FONT_FACE_ID = id('font-face');
const FILL_ID = id('fill');
const PARAGRAPH_ID = id('paragraph');
const RUN_ID = id('run');
const HOSTILE_TEXT = '<img src=x onerror=alert(1)>';
const RESOLVED_ASSET_URL = 'https://assets.example.com/image.png';
const NO_SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const NO_FONTS: ReadonlyMap<projectFormatV1.Id, projectFormatV1.FontFamilyResource> = new Map();

function srgb(red: number, green: number, blue: number, alpha = 1): projectFormatV1.ConcreteColorValue {
  return { kind: 'color', space: 'srgb', channels: [red, green, blue], alpha };
}

function context(resolveAssetUrl: RenderContextV1['resolveAssetUrl'] = (): undefined => undefined): RenderContextV1 {
  return { swatches: NO_SWATCHES, fonts: NO_FONTS, resolveAssetUrl, document };
}

function geometry(): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: 120,
    height: 60,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 12, 34] },
    origin: [10, 20, 0],
  });
}

function rectangle(
  options: {
    readonly cornerRadii?: readonly [number, number, number, number];
    readonly appearance?: projectFormatV1.Appearance;
    readonly accessibility?: projectFormatV1.ElementAccessibility;
  } = {},
): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: ELEMENT_ID,
    name: 'Rectangle',
    geometry: geometry(),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(options.cornerRadii),
    ...(options.appearance === undefined ? {} : { appearance: options.appearance }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility }),
  });
}

describe('renderElementV1', () => {
  it('composes container identity, box geometry, and appearance styles', () => {
    const appearance: projectFormatV1.Appearance = {
      ...projectFormatV1.createDefaultAppearance(),
      opacity: 0.5,
      fills: [
        {
          id: FILL_ID,
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          paint: { kind: 'solid', color: srgb(1, 0, 0) },
        },
      ],
    };

    const node = renderElementV1(rectangle({ appearance }), context());

    expect(node.dataset['elementId']).toBe(ELEMENT_ID);
    expect(node.style.position).toBe('absolute');
    expect(node.style.boxSizing).toBe('border-box');
    expect(node.style.width).toBe('120px');
    expect(node.style.height).toBe('60px');
    expect(node.style.transform).toBe('matrix(1, 0, 0, 1, 12, 34)');
    expect(node.style.transformOrigin).toBe('10px 20px 0px');
    expect(node.style.opacity).toBe('0.5');
    expect(node.style.backgroundImage).toBe('linear-gradient(color(srgb 1 0 0), color(srgb 1 0 0))');
  });

  it('renders ordered paragraphs and runs through inert text nodes', () => {
    const firstProperties = projectFormatV1.createRunProperties({
      fontFamilyId: FONT_FAMILY_ID,
      fontFaceId: FONT_FACE_ID,
      size: 18,
    });
    const secondProperties = projectFormatV1.createRunProperties({
      fontFamilyId: FONT_FAMILY_ID,
      fontFaceId: FONT_FACE_ID,
    });
    const text: projectFormatV1.TextBody = {
      paragraphs: [
        {
          id: PARAGRAPH_ID,
          properties: projectFormatV1.createParagraphProperties(),
          runs: [
            { id: RUN_ID, text: 'Safe text', properties: firstProperties },
            { id: id('hostile-run'), text: HOSTILE_TEXT, properties: secondProperties },
          ],
        },
        {
          id: id('second-paragraph'),
          properties: { ...projectFormatV1.createParagraphProperties(), alignment: 'center' },
          runs: [{ id: id('second-run'), text: 'Second paragraph', properties: secondProperties }],
        },
      ],
    };
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Text',
      geometry: geometry(),
      kind: 'text',
      text,
    });

    const node = renderElementV1(element, context());
    const paragraphs = node.querySelectorAll<HTMLDivElement>(':scope > div');
    const spans = node.querySelectorAll<HTMLSpanElement>('span');
    const hostileSpan = spans.item(1);

    expect(paragraphs).toHaveLength(2);
    expect(spans).toHaveLength(3);
    expect(paragraphs.item(1).style.textAlign).toBe('center');
    expect(spans.item(0).style.fontSize).toBe('18px');
    expect(hostileSpan.textContent).toBe(HOSTILE_TEXT);
    expect(hostileSpan.children).toHaveLength(0);
  });

  it('renders rectangle corner radii in clockwise order', () => {
    const node = renderElementV1(rectangle({ cornerRadii: [1, 2, 3, 4] }), context());

    expect(node.style.borderRadius).toBe('1px 2px 3px 4px');
  });

  it('renders an ellipse with a circular border radius', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Ellipse',
      geometry: geometry(),
      kind: 'vector',
      geometryData: projectFormatV1.createEllipseGeometry(),
    });

    expect(renderElementV1(element, context()).style.borderRadius).toBe('50%');
  });

  it('renders a structured path as inline SVG path data with its first solid fill', () => {
    const startId = id('start');
    const endId = id('end');
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Path',
      geometry: geometry(),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: FILL_ID,
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: srgb(0, 0, 1) },
          },
        ],
      },
      kind: 'vector',
      geometryData: {
        kind: 'path',
        fillRule: 'evenodd',
        path: {
          points: [
            { id: startId, x: 0, y: 0 },
            { id: endId, x: 40, y: 30 },
          ],
          segments: [
            { id: id('move'), kind: 'move', pointId: startId },
            { id: id('line'), kind: 'line', pointId: endId },
          ],
          closed: true,
        },
      },
    });

    const node = renderElementV1(element, context());
    const path = node.querySelector<SVGPathElement>('svg > path');

    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toBe('M 0 0 L 40 30 Z');
    expect(path?.getAttribute('fill')).toBe('color(srgb 0 0 1)');
    expect(path?.getAttribute('fill-rule')).toBe('evenodd');
    // The fill is drawn on the SVG path, so the container must NOT also paint it as a box background.
    expect(node.style.backgroundImage).toBe('');
  });

  it('renders a resolved image URL, object fit, dimensions, and accessible alt text', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Image',
      geometry: geometry(),
      accessibility: { decorative: false, label: 'Product photo' },
      kind: 'image',
      image: { assetId: ASSET_ID, fit: 'cover' },
    });

    const node = renderElementV1(
      element,
      context((): string => RESOLVED_ASSET_URL),
    );
    const image = node.querySelector<HTMLImageElement>('img');

    expect(image?.getAttribute('src')).toBe(RESOLVED_ASSET_URL);
    expect(image?.style.objectFit).toBe('cover');
    expect(image?.style.width).toBe('100%');
    expect(image?.style.height).toBe('100%');
    expect(image?.alt).toBe('Product photo');
  });

  it('omits image src when asset resolution fails', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Image',
      geometry: geometry(),
      kind: 'image',
      image: { assetId: ASSET_ID, fit: 'contain' },
    });

    expect(renderElementV1(element, context()).querySelector('img')?.hasAttribute('src')).toBe(false);
  });

  it('renders placeholder kinds without throwing', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Video',
      geometry: geometry(),
      kind: 'video',
      video: { assetId: ASSET_ID, fit: 'contain', autoplay: false, loop: false, muted: true, controls: false },
    });

    expect(renderElementV1(element, context()).dataset['elementKind']).toBe('video');
  });

  it('renders a clock format as static text', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Clock',
      geometry: geometry(),
      kind: 'clock',
      clock: { format: 'HH:mm:ss', timeZone: 'UTC' },
    });

    expect(renderElementV1(element, context()).querySelector('span')?.textContent).toBe('HH:mm:ss');
  });

  it('renders ticker items as readable content', () => {
    const element = projectFormatV1.createElementV1({
      id: ELEMENT_ID,
      name: 'Ticker',
      geometry: geometry(),
      kind: 'ticker',
      ticker: {
        items: [
          { id: projectFormatV1.idSchema.parse('ticker-item-1'), text: 'First headline' },
          { id: projectFormatV1.idSchema.parse('ticker-item-2'), text: 'Second headline' },
        ],
        direction: 'left',
        speed: 70,
        gap: 80,
        repeat: true,
      },
    });

    expect(renderElementV1(element, context()).textContent).toContain('First headline');
    expect(renderElementV1(element, context()).textContent).toContain('Second headline');
  });

  it('maps accessibility role, label, and decorative state', () => {
    const node = renderElementV1(
      rectangle({ accessibility: { decorative: true, role: 'img', label: 'Decorative flourish' } }),
      context(),
    );

    expect(node.getAttribute('role')).toBe('img');
    expect(node.getAttribute('aria-label')).toBe('Decorative flourish');
    expect(node.getAttribute('aria-hidden')).toBe('true');
  });
});
