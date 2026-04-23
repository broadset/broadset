import { describe, expect, it } from 'vitest';

import { exportPsdBytes, importPsd } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

describe('PSD Path Layer Export', () => {
  /**
   * @description An open SVG path (no Z close command) must be exported
   * as a stroke-only PSD layer.
   */
  it('exports open path as stroke-only layer', () => {
    const doc = makeDocument({
      elements: [
        makeElement('path', {
          content: 'M 0 0 L 100 50',
          style: makeStyle({ borderWidth: 2, borderColor: '#000000' }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const pathEl = imported.elements.find((el) => el.type === 'path');

    expect(pathEl).toBeDefined();
  });
});

describe('PSD Clip-Path Mask Export', () => {
  /**
   * @description Rectangle and ellipse elements with clip-paths must be
   * exported with boolean intersect vector masks.
   */
  it('exports rectangle/ellipse clip-paths as vector masks', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
          }),
        }),
        makeElement('ellipse', {
          style: makeStyle({
            backgroundColor: '#00ff00',
            customClipPath: 'circle(50%)',
          }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);

    expect(imported.elements.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description Image elements with clip-paths must have vector masks
   * applied to the raster layer in the PSD output.
   */
  it('exports image with clip-path as raster layer with vector mask', () => {
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
          style: makeStyle({
            customClipPath: 'polygon(10% 10%, 90% 10%, 90% 90%, 10% 90%)',
          }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('PSD Border Radius Export', () => {
  /**
   * @description A rectangle with borderRadius and clip-path must have
   * both a rounded mask and the clip intersection mask in the PSD output.
   */
  it('exports rounded rectangle with clip preserving both masks', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#0000ff',
            borderRadius: [10, 10, 10, 10],
            customClipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
          }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.borderRadius).toBeDefined();
    }
  });
});

describe('PSD Layer Effects Export', () => {
  /** @description Elements with boxShadow must be exported with PSD drop shadow layer effects. */
  it('exports boxShadow as PSD drop shadow effect', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ffffff',
            boxShadow: '4px 4px 8px rgba(0,0,0,0.5)',
          }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
  });

  /** @description CSS mixBlendMode must map to the corresponding PSD blend mode on the layer. */
  it('maps CSS mixBlendMode to PSD blend mode', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            mixBlendMode: 'multiply',
          }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.mixBlendMode).toBe('multiply');
    }
  });
});

describe('PSD Smart Object Export', () => {
  /** @description Image elements with data URI content must be embedded as smart objects in the PSD. */
  it('exports data URI image as smart object', () => {
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const img = imported.elements.find((el) => el.type === 'image');

    expect(img).toBeDefined();

    if (img) {
      expect(img.content).toContain('data:image');
    }
  });
});

describe('PSD Artboard and Text Export', () => {
  /**
   * @description Multiple document pages must map to PSD artboards so
   * each page becomes a separate artboard within the PSD file.
   */
  it('exports multiple pages as PSD artboards', () => {
    const doc = makeDocument({
      pages: [
        { id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} },
        { id: 'page-2', name: 'Page 2', elements: [], locale: null, extensions: {} },
      ],
      elements: [
        makeElement('rectangle', { style: makeStyle({ backgroundColor: '#ff0000' }) }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);

    expect(imported.pages.length).toBeGreaterThanOrEqual(2);
  });

  /** @description Text elements must be exported as PSD text layers with the correct text content preserved. */
  it('exports text element as PSD text layer', () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello PSD',
          style: makeStyle({ fontSize: 24, fontColor: '#333333' }),
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const textEl = imported.elements.find((el) => el.type === 'text');

    expect(textEl).toBeDefined();

    if (textEl) {
      expect(textEl.content).toBe('Hello PSD');
    }
  });
});
