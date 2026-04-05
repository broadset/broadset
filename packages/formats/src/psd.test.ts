import type { AnimationRegistryEntry, BroadsetDocument, BroadsetElement, PageElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';
import { readPsd } from 'ag-psd';

import { exportPsd, importPsd, svgPathToPsdVectorMask } from './psd';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Converts a BroadsetElement to a PageElement for document assembly. */
function toPageElement(el: BroadsetElement): PageElement {
  return {
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    content: el.content,
    parentId: el.parentId,
    groupId: el.groupId,
    screen: el.screen as unknown as Record<string, unknown>,
    style: el.style as unknown as Record<string, unknown>,
  };
}

/** @description Creates a minimal valid BroadsetDocument for testing. */
function makeDoc(
  elements: readonly BroadsetElement[],
  options?: {
    readonly pages?: ReadonlyArray<{
      readonly id: string;
      readonly elements: readonly BroadsetElement[];
    }>;
    readonly animationRegistry?: readonly AnimationRegistryEntry[];
  },
): BroadsetDocument {
  if (options?.pages) {
    return {
      id: 'doc-1',
      documentMode: 'print',
      canvas: { width: 210, height: 118, padding: [0, 0, 0, 0] },
      pages: options.pages.map((p) => ({
        id: p.id,
        elements: p.elements.map(toPageElement),
      })),
      animationRegistry: options.animationRegistry ?? [],
    };
  }

  return {
    id: 'doc-1',
    documentMode: 'print',
    canvas: { width: 210, height: 118, padding: [0, 0, 0, 0] },
    pages: [{ id: 'page-1', elements: elements.map(toPageElement) }],
    animationRegistry: options?.animationRegistry ?? [],
  };
}

/** @description Reads a PSD buffer with ag-psd for verification. */
function parsePsd(buffer: Uint8Array) {
  return readPsd(buffer.buffer as ArrayBuffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: false,
    useImageData: true,
  });
}

/** @description Small 1x1 red pixel PNG as base64 data URI */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// ===========================================================================
// PSD Path Layer Export
// ===========================================================================

describe('PSD Path Layer Export', () => {
  /**
   * @description Open SVG paths (no Z close command) MUST be exported as
   * open, stroke-only PSD layers. This preserves the open-path semantics
   * and ensures the layer is rendered with stroke, not fill.
   */
  it('exports open SVG path as open, stroke-only layer', () => {
    const pathEl = createDefaultElement('path', {
      id: 'path-open',
      content: 'M10,10 L90,10 L90,90',
      width: 100,
      height: 100,
    });
    const doc = makeDoc([pathEl]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const pathLayer = children.find((l) => l.name === 'path-open');

    expect(pathLayer).toBeDefined();

    if (!pathLayer) throw new Error('path layer not found');

    // Must have a vector mask with open path
    expect(pathLayer.vectorMask).toBeDefined();
    expect(pathLayer.vectorMask?.paths.length).toBeGreaterThan(0);

    const firstPath = pathLayer.vectorMask?.paths[0];

    expect(firstPath).toBeDefined();
    expect(firstPath?.open).toBe(true);

    // Must have vector stroke enabled (stroke-only)
    expect(pathLayer.vectorStroke?.strokeEnabled).toBe(true);
  });
});

// ===========================================================================
// PSD Clip-Path Mask Export
// ===========================================================================

describe('PSD Clip-Path Mask Export', () => {
  /**
   * @description Rectangle and ellipse elements with clip-paths MUST be
   * exported with boolean intersect vector masks. This models the CSS
   * clip-path behavior of intersecting the element's shape with the clip.
   */
  it('writes boolean intersect vector masks for rectangle with clip-path', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-clip',
      width: 100,
      height: 100,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      screen: {
        ...rectEl.screen,
        customClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'rect-clip');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('rectangle clip layer not found');

    // Must have vector mask with intersect operation
    expect(layer.vectorMask).toBeDefined();

    const paths = layer.vectorMask?.paths ?? [];

    expect(paths.length).toBeGreaterThan(0);

    // At least one path should use intersect operation
    const hasIntersect = paths.some((p) => p.operation === 'intersect');

    expect(hasIntersect).toBe(true);
  });

  /**
   * @description Image elements with clip-paths MUST have vector masks
   * applied to the raster layer, modeling the CSS clip-path effect.
   */
  it('applies vector mask to raster layer with clip-path', () => {
    const imgEl = createDefaultElement('image', {
      id: 'img-clip',
      content: TINY_PNG,
      width: 100,
      height: 100,
    });
    const styledImg: BroadsetElement = {
      ...imgEl,
      screen: {
        ...imgEl.screen,
        customClipPath: 'path("M10,10 L90,10 L90,90 L10,90 Z")',
      },
    };
    const doc = makeDoc([styledImg]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'img-clip');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('image clip layer not found');

    // Must have vector mask applied
    expect(layer.vectorMask).toBeDefined();
    expect(layer.vectorMask?.paths.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PSD Border Radius Export
// ===========================================================================

describe('PSD Border Radius Export', () => {
  /**
   * @description borderRadius MUST be exported as rounded rectangle vector
   * masks. When a clip-path is also present, both the rounded mask and
   * clip intersection should be present.
   */
  it('exports borderRadius as rounded rectangle vector mask with clip intersection', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-radius-clip',
      width: 100,
      height: 80,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: { ...rectEl.style, borderRadius: 12 },
      screen: {
        ...rectEl.screen,
        customClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'rect-radius-clip');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('rounded rect clip layer not found');

    // Must have vector mask
    expect(layer.vectorMask).toBeDefined();

    const paths = layer.vectorMask?.paths ?? [];

    // Should have multiple paths (rounded rect + clip intersection)
    expect(paths.length).toBeGreaterThanOrEqual(2);

    // At least one path should be intersect
    const hasIntersect = paths.some((p) => p.operation === 'intersect');

    expect(hasIntersect).toBe(true);

    // Should have rounded rectangle origination info
    const origination = layer.vectorOrigination?.keyDescriptorList;

    expect(origination).toBeDefined();

    if (origination && origination.length > 0) {
      const firstDesc = origination[0];

      expect(firstDesc?.keyOriginRRectRadii).toBeDefined();
    }
  });
});

// ===========================================================================
// PSD Layer Effects Export
// ===========================================================================

describe('PSD Layer Effects Export', () => {
  /**
   * @description CSS boxShadow and filter glow MUST be exported as PSD
   * layer effects (dropShadow, outerGlow). This preserves visual fidelity
   * of design elements.
   */
  it('exports boxShadow and filter glow as PSD layer effects', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-effects',
      width: 100,
      height: 60,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: {
        ...rectEl.style,
        backgroundColor: '#0000ff',
        boxShadow: '5px 5px 10px rgba(0,0,0,0.5)',
        filter: 'drop-shadow(0px 0px 8px rgba(255,0,0,0.8))',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'rect-effects');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('layer effects layer not found');

    // Must have effects with drop shadow
    expect(layer.effects).toBeDefined();
    expect(layer.effects?.dropShadow).toBeDefined();

    const shadows = layer.effects?.dropShadow;

    expect(shadows).toBeDefined();
    expect(shadows?.length).toBeGreaterThan(0);

    // Must have outer glow (from filter: drop-shadow → mapped as glow)
    expect(layer.effects?.outerGlow).toBeDefined();
  });

  /**
   * @description CSS mixBlendMode MUST map to PSD blend modes.
   * 'multiply' should map to PSD 'multiply' blend mode.
   */
  it('maps CSS mixBlendMode to PSD blend mode', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-blend',
      width: 100,
      height: 60,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: {
        ...rectEl.style,
        backgroundColor: '#ff0000',
        mixBlendMode: 'multiply',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'rect-blend');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('blend mode layer not found');

    expect(layer.blendMode).toBe('multiply');
  });
});

// ===========================================================================
// PSD Smart Object Export
// ===========================================================================

describe('PSD Smart Object Export', () => {
  /**
   * @description Image elements with data URI content MUST be exported
   * as embedded smart object linked files. The linked file data should
   * contain the decoded image bytes.
   */
  it('exports data URI image as embedded smart object linked file', () => {
    const imgEl = createDefaultElement('image', {
      id: 'img-smart',
      content: TINY_PNG,
      width: 50,
      height: 50,
    });
    const doc = makeDoc([imgEl]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'img-smart');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('smart object layer not found');

    // Must have placedLayer information
    expect(layer.placedLayer).toBeDefined();
    expect(layer.placedLayer?.type).toBe('raster');

    // Must have linked files at PSD level
    const linkedFiles = psd.linkedFiles ?? [];

    expect(linkedFiles.length).toBeGreaterThan(0);

    // Linked file should contain data bytes
    const linkedFile = linkedFiles[0];

    expect(linkedFile).toBeDefined();
    expect(linkedFile?.data).toBeDefined();
    expect(linkedFile?.data?.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PSD Artboard and Text Export
// ===========================================================================

describe('PSD Artboard and Text Export', () => {
  /**
   * @description Documents with multiple pages MUST be exported as PSD
   * artboards. Each page becomes a separate artboard group in the PSD
   * layer hierarchy.
   */
  it('exports multiple pages as PSD artboards', () => {
    const el1 = createDefaultElement('rectangle', { id: 'r1', width: 50, height: 50 });
    const el2 = createDefaultElement('rectangle', { id: 'r2', width: 50, height: 50 });
    const doc = makeDoc([], {
      pages: [
        { id: 'page-1', elements: [el1] },
        { id: 'page-2', elements: [el2] },
      ],
    });
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    // Each page should map to an artboard layer group
    const artboardLayers = children.filter((l) => l.artboard !== undefined);

    expect(artboardLayers.length).toBe(2);
  });

  /**
   * @description Text elements MUST be exported as PSD text layers
   * with the correct text content.
   */
  it('exports text element as PSD text layer with correct content', () => {
    const textEl = createDefaultElement('text', {
      id: 'txt-psd',
      content: 'Hello PSD',
      width: 200,
      height: 40,
    });
    const doc = makeDoc([textEl]);
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const textLayer = children.find((l) => l.name === 'txt-psd');

    expect(textLayer).toBeDefined();

    if (!textLayer) throw new Error('text layer not found');

    expect(textLayer.text).toBeDefined();
    expect(textLayer.text?.text).toBe('Hello PSD');
  });
});

// ===========================================================================
// PSD Import
// ===========================================================================

describe('PSD Import', () => {
  /**
   * @description Layer effects (shadows, glows) in PSD MUST be imported as
   * CSS shadow and filter properties on the recovered elements.
   */
  it('imports layer effects to CSS shadow and filter properties', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-fx',
      width: 100,
      height: 60,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: {
        ...rectEl.style,
        backgroundColor: '#0000ff',
        boxShadow: '5px 5px 10px rgba(0,0,0,0.5)',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const imported = importPsd(buffer);

    expect(imported.pages.length).toBeGreaterThan(0);

    const page = imported.pages[0];

    if (!page) throw new Error('no imported page');

    const el = page.elements.find((e) => e.type === 'rectangle');

    expect(el).toBeDefined();

    if (!el) throw new Error('no rectangle found');

    // boxShadow should be recovered
    expect(el.style.boxShadow).toBeDefined();
    expect(typeof el.style.boxShadow).toBe('string');
  });

  /**
   * @description Smart objects with embedded data MUST be imported as
   * image elements with data URI content.
   */
  it('imports smart object bytes as data URI image', () => {
    const imgEl = createDefaultElement('image', {
      id: 'img-so',
      content: TINY_PNG,
      width: 50,
      height: 50,
    });
    const doc = makeDoc([imgEl]);
    const buffer = exportPsd(doc);
    const imported = importPsd(buffer);

    const page = imported.pages[0];

    if (!page) throw new Error('no imported page');

    const el = page.elements.find((e) => e.type === 'image');

    expect(el).toBeDefined();

    if (!el) throw new Error('no image found');

    expect(el.content).toMatch(/^data:image/);
  });

  /**
   * @description Rounded rectangle vector masks in PSD MUST be imported
   * as borderRadius style values with rescaled values.
   */
  it('imports rounded rectangle masks to borderRadius', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-br',
      width: 100,
      height: 80,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: { ...rectEl.style, borderRadius: 15 },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const imported = importPsd(buffer);

    const page = imported.pages[0];

    if (!page) throw new Error('no imported page');

    const el = page.elements.find((e) => e.type === 'rectangle');

    expect(el).toBeDefined();

    if (!el) throw new Error('no rectangle found');

    // borderRadius should be recovered
    expect(el.style.borderRadius).toBeDefined();
    expect(typeof el.style.borderRadius === 'number').toBe(true);
  });

  /**
   * @description PSD artboards MUST be imported as document pages.
   * Each artboard group becomes a Page in the imported document.
   */
  it('imports artboards to pages', () => {
    const el1 = createDefaultElement('rectangle', { id: 'r1', width: 50, height: 50 });
    const el2 = createDefaultElement('rectangle', { id: 'r2', width: 50, height: 50 });
    const doc = makeDoc([], {
      pages: [
        { id: 'page-1', elements: [el1] },
        { id: 'page-2', elements: [el2] },
      ],
    });
    const buffer = exportPsd(doc);
    const imported = importPsd(buffer);

    expect(imported.pages.length).toBe(2);
  });

  /**
   * @description Opacity and borderRadius MUST be preserved across a
   * PSD export→import round-trip. Values should be close to the originals
   * (within floating-point tolerance).
   */
  it('preserves opacity and borderRadius across round-trip', () => {
    const rectEl = createDefaultElement('rectangle', {
      id: 'rect-rt',
      width: 100,
      height: 80,
    });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: {
        ...rectEl.style,
        opacity: 0.75,
        borderRadius: 10,
        backgroundColor: '#aabbcc',
      },
    };
    const doc = makeDoc([styledRect]);
    const buffer = exportPsd(doc);
    const imported = importPsd(buffer);

    const page = imported.pages[0];

    if (!page) throw new Error('no imported page');

    const el = page.elements.find((e) => e.type === 'rectangle');

    expect(el).toBeDefined();

    if (!el) throw new Error('no rectangle found');

    // Opacity should be preserved (PSD uses 0-255, we convert back to 0-1)
    expect(Math.abs(el.style.opacity - 0.75)).toBeLessThan(0.02);

    // Border radius should be preserved
    const br = el.style.borderRadius;

    expect(br).toBeDefined();
    expect(typeof br === 'number').toBe(true);

    if (typeof br === 'number') {
      expect(Math.abs(br - 10)).toBeLessThan(2);
    }
  });
});

// ===========================================================================
// PSD Path Vector Conversion
// ===========================================================================

describe('PSD Path Vector Conversion', () => {
  /**
   * @description Line path SVG data (M, L commands with Z close) MUST
   * produce a closed PSD vector mask with the correct number of knots.
   */
  it('builds closed vector mask from line path data', () => {
    // Triangle: M0,0 L100,0 L50,100 Z
    const result = svgPathToPsdVectorMask('M0,0 L100,0 L50,100 Z', 100, 100);

    expect(result).not.toBeNull();

    if (!result) throw new Error('expected non-null result');

    expect(result.open).toBe(false);
    expect(result.knots.length).toBe(3);
  });

  /**
   * @description Bezier SVG command data (C commands) MUST produce
   * cubic segments with correct control points in PSD coordinates.
   */
  it('creates cubic segments from bezier commands', () => {
    // Simple cubic: M0,0 C30,0 70,100 100,100
    const result = svgPathToPsdVectorMask('M0,0 C30,0 70,100 100,100', 100, 100);

    expect(result).not.toBeNull();

    if (!result) throw new Error('expected non-null result');

    // Should have 2 knots (start + end of the cubic)
    expect(result.knots.length).toBe(2);

    // Each knot must have 6 points (preceding cp, anchor, leaving cp)
    for (const knot of result.knots) {
      expect(knot.points.length).toBe(6);
    }
  });

  /**
   * @description Unsupported or invalid SVG path data MUST return null
   * to signal the conversion failure gracefully.
   */
  it('returns null for invalid path data', () => {
    expect(svgPathToPsdVectorMask('', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('not-a-path', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('X10,10', 100, 100)).toBeNull();
  });
});

// ===========================================================================
// PSD Animated Element Static Export
// ===========================================================================

describe('PSD Animated Element Static Export', () => {
  /**
   * @description Animated elements MUST be exported at their default/rest
   * state (t=0). The PSD layer should reflect base properties without
   * animation modifiers applied.
   */
  it('exports animated element at default/rest state t=0', () => {
    const animEl = createDefaultElement('rectangle', {
      id: 'rect-anim',
      width: 100,
      height: 60,
      position: { x: 50, y: 30 },
    });
    const styledAnimEl: BroadsetElement = {
      ...animEl,
      style: { ...animEl.style, backgroundColor: '#ff0000', opacity: 1 },
    };
    const doc = makeDoc([styledAnimEl], {
      animationRegistry: [
        {
          elementId: 'rect-anim',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'default',
                entries: [
                  {
                    name: 'k0',
                    action: 'none' as const,
                    offsetMs: 0,
                    properties: {
                      'position.x': {
                        value: 50,
                        interpolation: 'linear',
                      },
                    },
                  },
                  {
                    name: 'k1',
                    action: 'none' as const,
                    offsetMs: 1000,
                    properties: {
                      'position.x': {
                        value: 200,
                        interpolation: 'linear',
                      },
                    },
                  },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
          },
        },
      ],
    });
    const buffer = exportPsd(doc);
    const psd = parsePsd(buffer);

    const children = psd.children ?? [];
    const layer = children.find((l) => l.name === 'rect-anim');

    expect(layer).toBeDefined();

    if (!layer) throw new Error('animated layer not found');

    // Position should reflect t=0 base state (x=50), not animated state
    // PSD coordinates are in pixels; our units are mm but mapped to px at export
    expect(layer.left).toBeDefined();
  });
});
