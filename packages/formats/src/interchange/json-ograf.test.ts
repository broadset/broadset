import { broadsetProjectSchema } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { exportProjectJson, generateOGrafPackages } from './index';
import { first, makeDocument, makeElement, makeProject } from './test-helpers';

describe('JSON Document Export', () => {
  /** @description Validates that a document with animations survives JSON round-trip with schema and animation config intact. */
  it('preserves animations through JSON round-trip', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-1', content: 'Hello' })],
      animations: [
        {
          elementId: 'el-1',
          config: {
            timelines: [
              {
                id: 'tl-fade',
                name: 'fade',
                durationMs: 1000,
                keyframes: [
                  {
                    name: 'start',
                    action: 'none',
                    offsetMs: 0,
                    properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                  },
                  {
                    name: 'end',
                    action: 'none',
                    offsetMs: 1000,
                    properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                  },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    const doc0 = first(parsed.documents);

    expect(doc0.animations).toHaveLength(1);
    expect(first(doc0.animations).config.timelines).toHaveLength(1);
    expect(first(first(doc0.animations).config.timelines).keyframes).toHaveLength(2);
  });

  /** @description Validates that all pages are preserved through JSON export for a multi-page document. */
  it('preserves all pages in a multi-page document', () => {
    const doc = makeDocument({
      pages: [
        { id: 'page-1', name: 'Intro', elements: [], locale: null, extensions: {} },
        { id: 'page-2', name: 'Main', elements: [], locale: null, extensions: {} },
        { id: 'page-3', name: 'Outro', elements: [], locale: null, extensions: {} },
      ],
    });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    const doc0 = first(parsed.documents);

    expect(doc0.pages).toHaveLength(3);
    expect(doc0.pages.map((p) => p.name)).toEqual(['Intro', 'Main', 'Outro']);
  });

  /** @description Validates that all 11 element types survive JSON round-trip without data loss. */
  it('round-trips all 11 element types', () => {
    const types = [
      'text',
      'image',
      'rectangle',
      'path',
      'ellipse',
      'svg',
      'qrcode',
      'group',
      'video',
      'clock',
      'ticker',
    ] as const;
    const elements = types.map((type) =>
      makeElement({
        type,
        id: `el-${type}`,
        name: type,
        content: type === 'qrcode' ? 'https://example.com' : '',
      }),
    );
    const doc = makeDocument({ elements: [...elements] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));
    const roundTrippedTypes = first(parsed.documents).elements.map((e) => e.type);

    for (const type of types) {
      expect(roundTrippedTypes).toContain(type);
    }
  });

  /** @description Validates that an empty document round-trips with structure preserved. */
  it('round-trips an empty document', () => {
    const doc = makeDocument({ elements: [] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    expect(parsed.documents).toHaveLength(1);
    expect(first(parsed.documents).elements).toHaveLength(0);
  });

  /** @description Stress test: 100 elements round-trip without data loss. */
  it('round-trips 100 elements without data loss', () => {
    const elements = Array.from({ length: 100 }, (_, i) =>
      makeElement({ type: 'rectangle', id: `el-${String(i)}`, name: `rect-${String(i)}` }),
    );
    const doc = makeDocument({ elements: [...elements] });
    const project = makeProject([doc]);
    const json = exportProjectJson(project);
    const parsed = broadsetProjectSchema.parse(JSON.parse(json));

    expect(first(parsed.documents).elements).toHaveLength(100);
  });

  /** @description Validates that the JSON payload is valid BroadsetProject JSON. */
  it('produces valid BroadsetProject JSON', () => {
    const project = makeProject();
    const json = exportProjectJson(project);

    expect(() => broadsetProjectSchema.parse(JSON.parse(json))).not.toThrow();
  });
});

describe('OGraf Package Generation', () => {
  /** @description Validates that one OGraf package is generated per top-level element. */
  it('produces one package per top-level element', () => {
    const elements = [
      makeElement({ type: 'text', id: 'el-1', content: 'Hello' }),
      makeElement({ type: 'rectangle', id: 'el-2' }),
      makeElement({ type: 'image', id: 'el-3' }),
    ];
    const doc = makeDocument({ elements: [...elements] });
    const packages = generateOGrafPackages(doc);

    expect(packages).toHaveLength(3);
  });

  /** @description Validates that text content is exposed as default values in the OGraf schema. */
  it('exposes text content as schema default values', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-1', content: 'Hello World' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.schema.defaults).toBeDefined();
    expect(Object.values(pkg.schema.defaults)).toContain('Hello World');
  });

  /** @description Validates that image elements are NOT exposed as text data inputs. */
  it('does not expose image elements as text data inputs', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'image', id: 'el-img', content: 'https://example.com/img.png' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);
    const textInputTypes = pkg.schema.inputs.map((i: { readonly type: string }) => i.type);

    expect(textInputTypes).not.toContain('text');
  });

  /** @description Validates that QR elements produce pre-rendered inline SVG in the runtime. */
  it('pre-renders QR elements to inline SVG', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'qrcode', id: 'el-qr', content: 'https://example.com' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.runtime).toContain('<svg');
    expect(pkg.runtime).toContain('</svg>');
  });

  /** @description OGraf runtime must include element geometry (position, width, height) as inline style. */
  it('includes element geometry as inline styles in runtime', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          id: 'el-geo',
          position: { x: 50, y: 30 },
          width: 200,
          height: 100,
        }),
      ],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.runtime).toContain('left:50px');
    expect(pkg.runtime).toContain('top:30px');
    expect(pkg.runtime).toContain('width:200px');
    expect(pkg.runtime).toContain('height:100px');
  });

  /** @description OGraf packages must include renderRequirements from canvas dimensions. */
  it('includes renderRequirements with canvas dimensions', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-1', content: 'Hello' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.renderRequirements.width).toBeGreaterThan(0);
    expect(pkg.renderRequirements.height).toBeGreaterThan(0);
  });

  /** @description Elements with animations must have stepCount > 0 and set-step custom action. */
  it('includes stepCount and customActions for animated elements', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'text', id: 'el-anim', content: 'Animated' })],
      animations: [
        {
          elementId: 'el-anim',
          config: {
            modifierTimelineBindings: [],
            stateTimelineBindings: [],
            textAnimator: null,
            timelines: [
              {
                id: 'tl-1',
                name: 'enter',
                durationMs: 1000,
                loop: 'none' as const,
                keyframes: [
                  {
                    name: 'start',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: {
                      opacity: { type: 'number' as const, value: 0, easing: 'linear' as const },
                    },
                  },
                  {
                    name: 'end',
                    action: 'none' as const,
                    offsetMs: 1000,
                    properties: {
                      opacity: { type: 'number' as const, value: 1, easing: 'linear' as const },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.stepCount).toBe(2);
    expect(pkg.customActions).toContain('set-step');
  });

  /** @description Non-animated elements must have stepCount 0 and no custom actions. */
  it('has zero stepCount for non-animated elements', () => {
    const doc = makeDocument({
      elements: [makeElement({ type: 'rectangle', id: 'el-static' })],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.stepCount).toBe(0);
    expect(pkg.customActions).toHaveLength(0);
  });

  /** @description Elements with dataField must expose data binding in schema. */
  it('exposes dataField as schema input', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'text',
          id: 'el-data',
          content: 'Score: {score}',
          dataField: { fieldName: 'score', overflow: 'clip' as const },
        }),
      ],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    // Should have text content input and data field input
    expect(pkg.schema.inputs.length).toBe(2);
    expect(pkg.schema.defaults).toHaveProperty('el-data-data', 'score');
  });

  /** @description Runtime must include rotation as transform style. */
  it('includes rotation in runtime style', () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          type: 'rectangle',
          id: 'el-rot',
          rotation: 45,
        }),
      ],
    });
    const packages = generateOGrafPackages(doc);
    const pkg = first(packages);

    expect(pkg.runtime).toContain('transform:rotate(45deg)');
  });
});
