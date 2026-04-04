import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as htmlToImage from 'html-to-image';

import {
  CANVAS_DATA_MARKER,
  DEFAULT_JPEG_QUALITY,
  downloadEmbeddedSvg,
  downloadJpeg,
  downloadPng,
  exportEmbeddedSvgBlob,
  exportJpegBlob,
  exportPngBlob,
  findCanvasElement,
} from './raster';

// ---------------------------------------------------------------------------
// Mocks — jest.mock is hoisted above imports by babel-jest
// ---------------------------------------------------------------------------

jest.mock('html-to-image', () => ({
  toBlob: jest.fn(),
  toSvg: jest.fn(),
}));

type ToBlobMock = jest.Mock<(...args: unknown[]) => Promise<Blob | null>>;
type ToSvgMock = jest.Mock<(...args: unknown[]) => Promise<string>>;

const mockToBlob = htmlToImage.toBlob as unknown as ToBlobMock;
const mockToSvg = htmlToImage.toSvg as unknown as ToSvgMock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Creates a mock raster target element with known dimensions. */
function createMockTarget(width: number, height: number): HTMLDivElement {
  const el = document.createElement('div');

  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });

  return el;
}

/** @description Creates a minimal PNG blob for test mocking. */
function createMockPngBlob(): Blob {
  return new Blob(['PNG'], { type: 'image/png' });
}

/** @description Creates a minimal JPEG blob for test mocking. */
function createMockJpegBlob(): Blob {
  return new Blob(['JPEG'], { type: 'image/jpeg' });
}

// ===========================================================================
// PNG Raster Export
// ===========================================================================

describe('PNG Raster Export', () => {
  beforeEach(() => {
    mockToBlob.mockReset();
  });

  /** @description PNG export at 1x must produce a blob with image/png MIME and matching dimensions. */
  it('exports PNG blob at pixel ratio 1 with correct options', async () => {
    mockToBlob.mockResolvedValue(createMockPngBlob());

    const target = createMockTarget(1920, 1080);
    const result = await exportPngBlob(target, { pixelRatio: 1 });

    expect(result.type).toBe('image/png');
    expect(mockToBlob).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        pixelRatio: 1,
        canvasWidth: 1920,
        canvasHeight: 1080,
      }),
    );
  });

  /** @description PNG export at 2x must double the canvas dimensions. */
  it('scales canvas dimensions by pixel ratio 2', async () => {
    mockToBlob.mockResolvedValue(createMockPngBlob());

    const target = createMockTarget(1920, 1080);

    await exportPngBlob(target, { pixelRatio: 2 });

    expect(mockToBlob).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        pixelRatio: 2,
        canvasWidth: 3840,
        canvasHeight: 2160,
      }),
    );
  });

  /** @description PNG export must ignore quality parameter since PNG is lossless. */
  it('ignores quality parameter for PNG', async () => {
    mockToBlob.mockResolvedValue(createMockPngBlob());

    const target = createMockTarget(100, 100);

    await exportPngBlob(target, { pixelRatio: 1, quality: 0.5 });

    expect(mockToBlob).toHaveBeenCalledWith(target, expect.not.objectContaining({ quality: 0.5 }));
  });
});

// ===========================================================================
// JPEG Raster Export
// ===========================================================================

describe('JPEG Raster Export', () => {
  beforeEach(() => {
    mockToBlob.mockReset();
  });

  /** @description JPEG export at 1x must produce a blob with image/jpeg MIME. */
  it('exports JPEG blob at pixel ratio 1 with correct MIME', async () => {
    mockToBlob.mockResolvedValue(createMockJpegBlob());

    const target = createMockTarget(1920, 1080);
    const result = await exportJpegBlob(target, { pixelRatio: 1 });

    expect(result.type).toBe('image/jpeg');
    expect(mockToBlob).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        pixelRatio: 1,
        canvasWidth: 1920,
        canvasHeight: 1080,
      }),
    );
  });

  /** @description JPEG export at 2x must double the canvas dimensions. */
  it('scales canvas dimensions by pixel ratio 2', async () => {
    mockToBlob.mockResolvedValue(createMockJpegBlob());

    const target = createMockTarget(1920, 1080);

    await exportJpegBlob(target, { pixelRatio: 2 });

    expect(mockToBlob).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        pixelRatio: 2,
        canvasWidth: 3840,
        canvasHeight: 2160,
      }),
    );
  });

  /** @description JPEG export with explicit quality must pass it through. */
  it('passes explicit quality parameter', async () => {
    mockToBlob.mockResolvedValue(createMockJpegBlob());

    const target = createMockTarget(100, 100);

    await exportJpegBlob(target, { pixelRatio: 1, quality: 0.5 });

    expect(mockToBlob).toHaveBeenCalledWith(target, expect.objectContaining({ quality: 0.5 }));
  });

  /** @description JPEG export without quality must use the default 0.92. */
  it('uses default quality 0.92 when not specified', async () => {
    mockToBlob.mockResolvedValue(createMockJpegBlob());

    const target = createMockTarget(100, 100);

    await exportJpegBlob(target, { pixelRatio: 1 });

    expect(mockToBlob).toHaveBeenCalledWith(target, expect.objectContaining({ quality: DEFAULT_JPEG_QUALITY }));
  });
});

// ===========================================================================
// Canvas Element Discovery
// ===========================================================================

describe('Canvas Element Discovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /** @description Must discover a mounted element with the canvas data marker. */
  it('finds the marked canvas element', () => {
    const el = document.createElement('div');

    el.setAttribute(CANVAS_DATA_MARKER, '');
    document.body.appendChild(el);

    const result = findCanvasElement();

    expect(result).toBe(el);
  });

  /** @description Must return null when no canvas marker is present. */
  it('returns null when no marker is present', () => {
    const result = findCanvasElement();

    expect(result).toBeNull();
  });
});

// ===========================================================================
// Embedded SVG Raster Export
// ===========================================================================

describe('Embedded SVG Raster Export', () => {
  beforeEach(() => {
    mockToSvg.mockReset();
  });

  /** @description Embedded SVG blob must have image/svg+xml MIME type. */
  it('produces a valid SVG blob', async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

    mockToSvg.mockResolvedValue(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`);

    const target = createMockTarget(100, 100);
    const result = await exportEmbeddedSvgBlob(target);

    expect(result.type).toBe('image/svg+xml');
  });

  /** @description Equivalent inputs must produce deterministic output. */
  it('produces deterministic output for equivalent inputs', async () => {
    const svgData = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E';

    mockToSvg.mockResolvedValue(svgData);

    const target1 = createMockTarget(100, 100);
    const target2 = createMockTarget(100, 100);

    const blob1 = await exportEmbeddedSvgBlob(target1);
    const blob2 = await exportEmbeddedSvgBlob(target2);

    expect(blob1.size).toBe(blob2.size);
    expect(blob1.type).toBe(blob2.type);
  });
});

// ===========================================================================
// Download Wrappers
// ===========================================================================

describe('Raster Download Wrappers', () => {
  let createElementSpy: jest.SpiedFunction<(tagName: string) => HTMLElement>;
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    mockToBlob.mockReset();
    mockToSvg.mockReset();

    mockAnchor = { href: '', download: '', click: jest.fn() };
    createElementSpy = jest.spyOn(document, 'createElement');
    createElementSpy.mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockAnchor as unknown as HTMLElement;
      }

      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });

    globalThis.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    createElementSpy.mockRestore();
  });

  /** @description PNG download must use the requested filename and trigger click. */
  it('downloads PNG with requested filename', async () => {
    mockToBlob.mockResolvedValue(createMockPngBlob());

    const target = createMockTarget(100, 100);

    await downloadPng(target, 'my-export.png');

    expect(mockAnchor.download).toBe('my-export.png');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  /** @description JPEG download must use the requested filename and trigger click. */
  it('downloads JPEG with requested filename', async () => {
    mockToBlob.mockResolvedValue(createMockJpegBlob());

    const target = createMockTarget(100, 100);

    await downloadJpeg(target, 'my-export.jpg');

    expect(mockAnchor.download).toBe('my-export.jpg');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  /** @description Embedded SVG download must use the requested filename and trigger click. */
  it('downloads embedded SVG with requested filename', async () => {
    mockToSvg.mockResolvedValue('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E');

    const target = createMockTarget(100, 100);

    await downloadEmbeddedSvg(target, 'my-export.svg');

    expect(mockAnchor.download).toBe('my-export.svg');
    expect(mockAnchor.click).toHaveBeenCalled();
  });
});
