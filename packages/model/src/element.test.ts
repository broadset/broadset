import { describe, expect, it } from '@jest/globals';

import { BUILT_IN_ELEMENT_TYPES, createDefaultElement, elementSchema, sanitizeTextContent } from './element';

/** @description Verifies the 8 built-in element types exist and custom plugin types are accepted */
describe('Element type vocabulary', () => {
  /** @description The system must accept exactly 8 built-in type literals — no fewer, no more */
  it('defines exactly 8 built-in element types', () => {
    const expectedTypes = ['text', 'image', 'svg', 'path', 'rectangle', 'ellipse', 'qrcode', 'group'];
    expect(BUILT_IN_ELEMENT_TYPES).toEqual(expect.arrayContaining(expectedTypes));
    expect(BUILT_IN_ELEMENT_TYPES).toHaveLength(8);
  });

  /** @description Each built-in type must produce a valid element that passes schema validation */
  it.each(['text', 'image', 'svg', 'path', 'rectangle', 'ellipse', 'qrcode', 'group'] as const)(
    'validates an element with built-in type "%s"',
    (type) => {
      const element = createDefaultElement(type);
      const result = elementSchema.safeParse(element);
      expect(result.success).toBe(true);
    },
  );

  /** @description Custom plugin types (arbitrary strings) must be accepted by the schema */
  it('accepts a custom plugin type', () => {
    const element = createDefaultElement('countdown');
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });
});

/** @description Validates element geometry: positive width/height, numeric position, finite rotation */
describe('Element position and dimensions', () => {
  /** @description Elements with valid position, width, height, and rotation must pass */
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

  /** @description Width must be strictly > 0 to prevent degenerate elements */
  it('rejects zero width', () => {
    const element = createDefaultElement('rectangle', { width: 0 });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description Negative height is physically meaningless and must be rejected */
  it('rejects negative height', () => {
    const element = createDefaultElement('rectangle', { height: -10 });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });
});

/** @description Ensures element content carries type-specific payload correctly */
describe('Element content semantics', () => {
  /** @description Text element content is used as display text (rich or plain) */
  it('uses content as display text for text elements', () => {
    const element = createDefaultElement('text', { content: 'Hello World' });
    expect(element.content).toBe('Hello World');
  });

  /** @description Image element content holds the image source URL */
  it('uses content as image source URL for image elements', () => {
    const element = createDefaultElement('image', {
      content: 'https://example.com/photo.jpg',
    });
    expect(element.content).toBe('https://example.com/photo.jpg');
  });

  /** @description Path element content holds SVG path d attribute data */
  it('uses content as SVG path data for path elements', () => {
    const element = createDefaultElement('path', { content: 'M 0 0 L 10 10' });
    expect(element.content).toBe('M 0 0 L 10 10');
  });
});

/** @description Validates parentId/groupId hierarchy semantics */
describe('Element hierarchy', () => {
  /** @description null parentId means the element is at root level on its page */
  it('treats null parentId as root-level', () => {
    const element = createDefaultElement('rectangle', { parentId: null });
    expect(element.parentId).toBeNull();
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description A non-null parentId references a group-type parent element */
  it('accepts a child element with valid parentId', () => {
    const element = createDefaultElement('rectangle', {
      parentId: 'parent-group-id',
    });
    expect(element.parentId).toBe('parent-group-id');
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Elements sharing a groupId form a multi-select unit */
  it('accepts elements sharing a groupId', () => {
    const a = createDefaultElement('rectangle', { groupId: 'g1' });
    const b = createDefaultElement('ellipse', { groupId: 'g1' });
    expect(a.groupId).toBe('g1');
    expect(b.groupId).toBe('g1');
  });
});

/** @description Default values must be deterministic so elements are consistent on creation */
describe('Element default values', () => {
  /** @description Screen property defaults ensure elements are visible and unanchored by default */
  it('has correct screen property defaults', () => {
    const element = createDefaultElement('rectangle');
    expect(element.screen.anchorX).toBe('left');
    expect(element.screen.anchorY).toBe('top');
    expect(element.screen.visibility).toBe('onscreen');
    expect(element.screen.locked).toBe(false);
    expect(element.screen.maskType).toBe('none');
    expect(element.screen.rotate3dX).toBe(0);
    expect(element.screen.rotate3dY).toBe(0);
    expect(element.screen.rotate3dZ).toBe(0);
    expect(element.screen.clipChildren).toBe(false);
  });

  /** @description Style opacity defaults to 1 (fully visible) */
  it('has style opacity 1 by default', () => {
    const element = createDefaultElement('rectangle');
    expect(element.style.opacity).toBe(1);
  });
});

/** @description parentId and groupId are independent axes — both, either, or neither can be set */
describe('parentId and groupId independence', () => {
  /** @description Both fields set simultaneously is valid (hierarchy + selection grouping) */
  it('accepts both parentId and groupId set to different values', () => {
    const element = createDefaultElement('rectangle', {
      parentId: 'parent-1',
      groupId: 'group-1',
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Only parentId set is valid (element is a child but not in a selection group) */
  it('accepts parentId set with groupId null', () => {
    const element = createDefaultElement('rectangle', {
      parentId: 'parent-1',
      groupId: null,
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Only groupId set is valid (root element in a selection group) */
  it('accepts groupId set with parentId null', () => {
    const element = createDefaultElement('rectangle', {
      parentId: null,
      groupId: 'group-1',
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });
});

/** @description Rotation can be any finite number; non-finite values must be rejected */
describe('Rotation normalization', () => {
  /** @description Negative rotation is stored as-is (no normalization to [0,360)) */
  it('preserves negative rotation values', () => {
    const element = createDefaultElement('rectangle', { rotation: -90 });
    expect(element.rotation).toBe(-90);
  });

  /** @description Rotation > 360 is stored as-is (no wrapping) */
  it('preserves rotation values exceeding 360', () => {
    const element = createDefaultElement('rectangle', { rotation: 450 });
    expect(element.rotation).toBe(450);
  });

  /** @description NaN rotation is meaningless and must be rejected */
  it('rejects NaN rotation', () => {
    const element = createDefaultElement('rectangle', { rotation: NaN });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description Infinity rotation is meaningless and must be rejected */
  it('rejects Infinity rotation', () => {
    const element = createDefaultElement('rectangle', { rotation: Infinity });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });
});

/** @description Position x/y must be finite numbers; NaN/Infinity must be rejected */
describe('Position finite validation', () => {
  /** @description NaN x makes positioning impossible */
  it('rejects NaN x', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: NaN, y: 0 },
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description NaN y makes positioning impossible */
  it('rejects NaN y', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: 0, y: NaN },
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description Infinity x is not a valid geometric position */
  it('rejects Infinity x', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: Infinity, y: 0 },
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description -Infinity y is not a valid geometric position */
  it('rejects -Infinity y', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: 0, y: -Infinity },
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description Negative coordinates are valid — elements can be off-canvas */
  it('accepts negative x and y', () => {
    const element = createDefaultElement('rectangle', {
      position: { x: -500, y: -200 },
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });
});

/** @description Content is validated per element type: text is sanitized, paths validated, qrcode non-empty */
describe('Content validation by element type', () => {
  /** @description Script tags are an XSS vector and must be stripped from text content */
  it('strips script tags from text content during validation', () => {
    const element = createDefaultElement('text', {
      content: "<script>alert('xss')</script>Hello",
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Hello');
    }
  });

  /** @description Allowed HTML tags (b, i, u, br, span, strong, em) must survive sanitization */
  it('preserves allowed tags in text content', () => {
    const html =
      '<b>bold</b> <i>italic</i> <u>underline</u> <br> <span>text</span> <strong>strong</strong> <em>emphasis</em>';
    const result = sanitizeTextContent(html);
    expect(result).toContain('<b>');
    expect(result).toContain('<i>');
    expect(result).toContain('<u>');
    expect(result).toContain('<br>');
    expect(result).toContain('<span>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });

  /** @description Only the style attribute is kept on allowed tags; all others are stripped */
  it('preserves style attribute but strips other attributes', () => {
    const input = '<span onclick="alert()" class="foo" style="color: red">text</span>';
    const result = sanitizeTextContent(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('class=');
    expect(result).toContain('style="color: red"');
  });

  /** @description Image elements accept valid URL strings */
  it('accepts image element with valid URL content', () => {
    const element = createDefaultElement('image', {
      content: 'https://example.com/img.png',
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Image elements accept empty content as a placeholder */
  it('accepts image element with empty content (placeholder)', () => {
    const element = createDefaultElement('image', { content: '' });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Path elements with valid SVG d attribute syntax must be accepted */
  it('accepts path element with valid SVG d attribute', () => {
    const element = createDefaultElement('path', {
      content: 'M 0 0 L 10 10',
    });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(true);
  });

  /** @description Path elements with invalid d attribute syntax must be rejected */
  it('rejects path element with invalid d attribute', () => {
    const element = createDefaultElement('path', { content: 'not a path' });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });

  /** @description QR code elements need data to encode so empty content is invalid */
  it('rejects qrcode element with empty content', () => {
    const element = createDefaultElement('qrcode', { content: '' });
    const result = elementSchema.safeParse(element);
    expect(result.success).toBe(false);
  });
});
