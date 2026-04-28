import { afterEach, describe, expect, it } from 'vitest';

import {
  BROADSET_FORMAT_IDS,
  broadsetFormatExtensionsBaseSchema,
  BUILT_IN_ELEMENT_TYPES,
  createDefaultElement,
  elementSchema,
  registerExtensionsSchema,
  sanitizeTextContent,
  unregisterExtensionsSchema,
} from './index';

/** @description The model exposes eleven built-in element types and still permits arbitrary plugin-defined types. */
describe('Element type vocabulary', () => {
  /** @description The built-in element set must include exactly the documented eleven types. */
  it('defines exactly 11 built-in element types', () => {
    const expectedTypes = [
      'text',
      'image',
      'svg',
      'path',
      'rectangle',
      'ellipse',
      'qrcode',
      'group',
      'video',
      'clock',
      'ticker',
    ];

    expect(BUILT_IN_ELEMENT_TYPES).toEqual(expect.arrayContaining(expectedTypes));
    expect(BUILT_IN_ELEMENT_TYPES).toHaveLength(11);
  });

  /** @description Every built-in element type and a custom plugin type must validate through the element schema. */
  it.each([
    'text',
    'image',
    'svg',
    'path',
    'rectangle',
    'ellipse',
    'qrcode',
    'group',
    'video',
    'clock',
    'ticker',
    'countdown',
  ] as const)('validates an element with type %s', (type) => {
    const element = createDefaultElement(type);
    const result = elementSchema.safeParse(element);

    expect(result.success).toBe(true);
  });
});

/** @description Geometry validation enforces positive size values while allowing arbitrary finite positions and rotation. */
describe('Element geometry', () => {
  /** @description Valid position, size, and rotation combinations must be accepted. */
  it('accepts valid position, width, height, and rotation', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: 10, y: 20 },
      width: 80,
      height: 50,
      rotation: 45,
    });
    const result = elementSchema.safeParse(element);

    expect(result.success).toBe(true);
  });

  /** @description Zero width and negative height are invalid because they produce degenerate geometry. */
  it('rejects invalid dimensions', () => {
    expect(elementSchema.safeParse(createDefaultElement('rectangle', { width: 0 })).success).toBe(false);
    expect(elementSchema.safeParse(createDefaultElement('rectangle', { height: -10 })).success).toBe(false);
  });

  /** @description Negative coordinates are valid, but NaN and Infinity are not. */
  it('validates finite position coordinates', () => {
    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          position: { x: -500, y: -200 },
        }),
      ).success,
    ).toBe(true);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          position: { x: Number.NaN, y: 0 },
        }),
      ).success,
    ).toBe(false);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          position: { x: 0, y: Number.NaN },
        }),
      ).success,
    ).toBe(false);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          position: { x: Number.POSITIVE_INFINITY, y: 0 },
        }),
      ).success,
    ).toBe(false);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          position: { x: 0, y: Number.NEGATIVE_INFINITY },
        }),
      ).success,
    ).toBe(false);
  });

  /** @description Rotation preserves arbitrary finite numbers but rejects non-finite values. */
  it('preserves finite rotation and rejects non-finite rotation', () => {
    expect(createDefaultElement('rectangle', { rotation: -90 }).rotation).toBe(-90);
    expect(createDefaultElement('rectangle', { rotation: 450 }).rotation).toBe(450);
    expect(elementSchema.safeParse(createDefaultElement('rectangle', { rotation: Number.NaN })).success).toBe(false);
    expect(
      elementSchema.safeParse(createDefaultElement('rectangle', { rotation: Number.POSITIVE_INFINITY })).success,
    ).toBe(false);
  });
});

/** @description Element content carries different semantics depending on the element type. */
describe('Element content semantics', () => {
  /** @description Text, image, and path elements must preserve their type-specific content payloads. */
  it('uses content appropriately for text, image, and path elements', () => {
    expect(createDefaultElement('text', { content: 'Hello World' }).content).toBe('Hello World');
    expect(createDefaultElement('image', { content: 'https://example.com/photo.jpg' }).content).toBe(
      'https://example.com/photo.jpg',
    );
    expect(createDefaultElement('path', { content: 'M 0 0 L 10 10' }).content).toBe('M 0 0 L 10 10');
  });
});

/** @description Parent and group relationships are independent axes for hierarchy and selection grouping. */
describe('Element hierarchy', () => {
  /** @description Root-level, child, and grouped elements must all validate. */
  it('accepts parentId and groupId combinations', () => {
    const root = createDefaultElement('rectangle', { parentId: null });
    const child = createDefaultElement('rectangle', { parentId: 'parent-group-id' });
    const groupedA = createDefaultElement('rectangle', { groupId: 'g1' });
    const groupedB = createDefaultElement('ellipse', { groupId: 'g1' });

    expect(root.parentId).toBeNull();
    expect(elementSchema.safeParse(root).success).toBe(true);
    expect(child.parentId).toBe('parent-group-id');
    expect(elementSchema.safeParse(child).success).toBe(true);
    expect(groupedA.groupId).toBe('g1');
    expect(groupedB.groupId).toBe('g1');
  });

  /** @description parentId and groupId may both be set, either may be null, and all combinations remain valid. */
  it('treats parentId and groupId as independent fields', () => {
    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          parentId: 'parent-1',
          groupId: 'group-1',
        }),
      ).success,
    ).toBe(true);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          parentId: 'parent-1',
          groupId: null,
        }),
      ).success,
    ).toBe(true);

    expect(
      elementSchema.safeParse(
        createDefaultElement('rectangle', {
          parentId: null,
          groupId: 'group-1',
        }),
      ).success,
    ).toBe(true);
  });
});

/** @description Default factories must produce deterministic top-level identity values and style defaults. */
describe('Element default values', () => {
  /** @description New rectangle elements should start unnamed, unlocked, and with neutral style defaults. */
  it('has correct top-level and style defaults', () => {
    const element = createDefaultElement('rectangle');

    expect(element.name).toBe('');
    expect(element.locked).toBe(false);
    expect(element.style.opacity).toBe(1);
    expect(element.style.maskType).toBe('none');
    expect(element.style.rotateX).toBe(0);
    expect(element.style.rotateY).toBe(0);
    expect(element.style.rotateZ).toBe(0);
    expect(element.style.translateZ).toBe(0);
    expect(element.style.clipChildren).toBe(false);
    expect(element.style.customClipPath).toBe('');
  });
});

/** @description Text content is sanitized for safety, and type-specific content validation rules must hold. */
describe('Content validation by element type', () => {
  /** @description Dangerous-but-non-script tags (style/iframe/embed) must still be silently stripped by the transform while allowed inline markup remains intact. */
  it('sanitizes text content while preserving allowed tags and style attributes', () => {
    const sanitizedResult = elementSchema.safeParse(
      createDefaultElement('text', {
        content: '<style>body{display:none}</style>Hello',
      }),
    );

    expect(sanitizedResult.success).toBe(true);

    if (sanitizedResult.success) {
      expect(sanitizedResult.data.content).toBe('Hello');
    }

    const richText =
      '<b>bold</b> <i>italic</i> <u>underline</u> <br> <span>text</span> <strong>strong</strong> <em>emphasis</em>';
    const richResult = sanitizeTextContent(richText);

    expect(richResult).toContain('<b>');
    expect(richResult).toContain('<i>');
    expect(richResult).toContain('<u>');
    expect(richResult).toContain('<br>');
    expect(richResult).toContain('<span>');
    expect(richResult).toContain('<strong>');
    expect(richResult).toContain('<em>');

    const attributeResult = sanitizeTextContent('<span onclick="alert()" class="foo" style="color: red">text</span>');

    expect(attributeResult).not.toContain('onclick');
    expect(attributeResult).not.toContain('class=');
    expect(attributeResult).toContain('style="color: red"');

    const unsafeStyleResult = sanitizeTextContent(
      '<span style="color: red; background-image: url(javascript:alert(1)); position: fixed">text</span>',
    );

    expect(unsafeStyleResult).toContain('style="color: red"');
    expect(unsafeStyleResult).not.toContain('background-image');
    expect(unsafeStyleResult).not.toContain('javascript:');
    expect(unsafeStyleResult).not.toContain('position: fixed');

    const quotedStyleResult = sanitizeTextContent(`<span style='color: "red"'>text</span>`);

    expect(quotedStyleResult).toContain('style="color: &quot;red&quot;"');
  });

  /**
   * @description Script-markers in rendered content are the classic XSS
   * surface. `createDefaultElement` is a trust boundary used by every
   * importer, so for `text` content it now actively sanitizes hostile
   * markup before returning. The element schema MUST still reject raw
   * `<script>` tags and HTML event-handler attributes for any path
   * (raw JSON parse, bypass of the factory, `svg` type whose payload
   * the factory does not flatten) so the contract fails loudly when
   * the factory is sidestepped.
   */
  it.each([
    ["<script>alert('x')</script>", 'text'],
    ['<script type="text/javascript">evil()</script>', 'text'],
    ['<SCRIPT>Xss</SCRIPT>', 'text'],
    ['<ScRiPt>mixed</ScRiPt>', 'text'],
    ['<span onclick="alert(1)">bad</span>', 'text'],
    ['<img src="x" onerror="alert(1)"/>', 'text'],
    ['<a onCLICK="x">link</a>', 'text'],
    ['<svg><script>alert(2)</script></svg>', 'svg'],
    ['<svg><g onload="alert(1)"/></svg>', 'svg'],
  ])('rejects content %s on type %s when bypassing createDefaultElement', (content, type) => {
    const baseline = createDefaultElement(type);
    const result = elementSchema.safeParse({ ...baseline, content });

    expect(result.success).toBe(false);
  });

  /**
   * @description `createDefaultElement` sanitizes hostile text content
   * at the factory boundary so importers that build elements via this
   * factory cannot accidentally land script tags or event-handler
   * attributes in persisted state.
   */
  it.each([
    "<script>alert('x')</script>",
    '<script type="text/javascript">evil()</script>',
    '<SCRIPT>Xss</SCRIPT>',
    '<ScRiPt>mixed</ScRiPt>',
    '<span onclick="alert(1)">bad</span>',
    '<img src="x" onerror="alert(1)"/>',
    '<a onCLICK="x">link</a>',
  ])('createDefaultElement strips hostile markup from text content: %s', (content) => {
    const element = createDefaultElement('text', { content });
    const flattened = typeof element.content === 'string' ? element.content : '';

    expect(flattened.toLowerCase()).not.toContain('<script');
    expect(flattened).not.toMatch(/\son[a-z]+\s*=/i);
    expect(elementSchema.safeParse(element).success).toBe(true);
  });

  /** @description Benign inline markup without script markers MUST still validate. */
  it.each([
    ['<b>bold</b>', 'text'],
    ['<i>italic</i>', 'text'],
    ['<span>plain</span>', 'text'],
    ['<strong>strong</strong>', 'text'],
    ['<em>emphasis</em><u>underline</u>', 'text'],
    ['Just plain text', 'text'],
    ['', 'text'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>', 'svg'],
  ])('accepts safe content %s on type %s', (content, type) => {
    const result = elementSchema.safeParse(createDefaultElement(type, { content }));

    expect(result.success).toBe(true);
  });

  /**
   * @description The `on*=` event-handler guard MUST match only attribute-shaped
   * occurrences inside a tag — plain text like `onion=cheese` MUST NOT trigger
   * rejection because it cannot execute in any renderer path.
   */
  it('does not false-positive on plain text that happens to start with "on"', () => {
    const result = elementSchema.safeParse(
      createDefaultElement('text', { content: 'The onion=cheese sandwich' }),
    );

    expect(result.success).toBe(true);
  });

  /**
   * @description Content types whose content does NOT flow through an HTML
   * rendering path (image URLs, QR payloads, ticker JSON, path `d` data) must
   * still pass validation even when their text happens to contain `on*=`
   * patterns or angle-bracket-free script keywords. The element-type-specific
   * validators already enforce the shape they need.
   */
  it('does not reject non-HTML-rendered content containing benign on=/"script" substrings', () => {
    expect(
      elementSchema.safeParse(
        createDefaultElement('image', { content: 'https://example.com/img.png?onclick=1' }),
      ).success,
    ).toBe(true);
    expect(
      elementSchema.safeParse(createDefaultElement('qrcode', { content: 'Buy onions' })).success,
    ).toBe(true);
  });

  /** @description Image placeholders, valid path data, and QR-code payload requirements must all validate correctly. */
  it('enforces type-specific content rules', () => {
    expect(
      elementSchema.safeParse(
        createDefaultElement('image', {
          content: 'https://example.com/img.png',
        }),
      ).success,
    ).toBe(true);
    expect(elementSchema.safeParse(createDefaultElement('image', { content: '' })).success).toBe(true);
    expect(
      elementSchema.safeParse(
        createDefaultElement('path', {
          content: 'M 0 0 L 10 10',
        }),
      ).success,
    ).toBe(true);
    expect(elementSchema.safeParse(createDefaultElement('path', { content: 'not a path' })).success).toBe(false);
    expect(elementSchema.safeParse(createDefaultElement('qrcode', { content: '' })).success).toBe(false);
  });
});

/** @description Element parsing wires the extensions registry per IO-D-11 — registered schemas fail loudly on stale data. */
describe('Element extensions validation (IO-D-11)', () => {
  afterEach(() => {
    for (const id of BROADSET_FORMAT_IDS) {
      unregisterExtensionsSchema(id);
    }
  });

  /** @description An element with a registered extensions namespace + valid payload parses successfully. */
  it('accepts valid registered extensions', () => {
    registerExtensionsSchema(
      'pdf',
      broadsetFormatExtensionsBaseSchema,
    );

    const element = {
      ...createDefaultElement('rectangle'),
      extensions: { pdf: { dirty: false } } as Readonly<Record<string, unknown>>,
    };

    expect(elementSchema.safeParse(element).success).toBe(true);
  });

  /** @description An element whose registered extensions payload fails its schema is rejected with an extensions-rooted issue path. */
  it('rejects an element whose registered extensions payload is invalid', () => {
    registerExtensionsSchema(
      'pdf',
      broadsetFormatExtensionsBaseSchema,
    );

    const element = {
      ...createDefaultElement('rectangle'),
      extensions: { pdf: { dirty: 'not a boolean' } } as Readonly<Record<string, unknown>>,
    };

    const result = elementSchema.safeParse(element);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'extensions' && issue.path[1] === 'pdf')).toBe(true);
    }
  });

  /** @description An element with an extensions namespace for which no schema is registered passes (forward-compat for deployments without that format package loaded). */
  it('accepts extensions namespaces without a registered schema', () => {
    const element = {
      ...createDefaultElement('rectangle'),
      extensions: { psd: { dirty: false, raw: 'unknown shape allowed' } } as Readonly<Record<string, unknown>>,
    };

    expect(elementSchema.safeParse(element).success).toBe(true);
  });
});
