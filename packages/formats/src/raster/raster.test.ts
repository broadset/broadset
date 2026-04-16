import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { WebMExportOptions } from './index';
import {
  captureElementToCanvas,
  discoverCanvasElement,
  discoverRendererRoot,
  exportEmbeddedSvgBlob,
  exportJpegBlob,
  exportPngBlob,
  exportWebMBlob,
  triggerDownload,
} from './index';

/* ------------------------------------------------------------------ */
/*  mediabunny mock for WebM export                                  */
/* ------------------------------------------------------------------ */

interface MockCanvasSourceCall {
  readonly timestamp: unknown;
  readonly duration: unknown;
}

interface WebMMockState {
  canvasSourceCalls: MockCanvasSourceCall[];
  canvasSourceConfig: unknown;
  outputFinalized: boolean;
  bufferContents: ArrayBuffer | null;
  webmFormatCreated: boolean;
}

var mockWebMState: WebMMockState = {
  canvasSourceCalls: [],
  canvasSourceConfig: undefined,
  outputFinalized: false,
  bufferContents: null,
  webmFormatCreated: false,
};

jest.mock('mediabunny', () => ({
  BufferTarget: jest.fn().mockImplementation(() => ({
    get buffer() {
      return mockWebMState.bufferContents;
    },
  })),
  CanvasSource: jest.fn().mockImplementation((_canvas, config) => {
    mockWebMState.canvasSourceConfig = config;

    return {
      add: jest.fn().mockImplementation((timestamp, duration) => {
        mockWebMState.canvasSourceCalls.push({ timestamp, duration });

        return Promise.resolve();
      }),
    };
  }),
  WebMOutputFormat: jest.fn().mockImplementation(() => {
    mockWebMState.webmFormatCreated = true;

    return { type: 'webm' };
  }),
  Output: jest.fn().mockImplementation(() => ({
    addVideoTrack: jest.fn(),
    start: jest.fn().mockImplementation(() => Promise.resolve()),
    finalize: jest.fn().mockImplementation(() => {
      mockWebMState.outputFinalized = true;
      mockWebMState.bufferContents = new ArrayBuffer(64);

      return Promise.resolve();
    }),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const CANVAS_MARKER = 'data-broadset-canvas';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff]);

/**
 * Tracks the last canvas dimensions and quality passed to toBlob,
 * so tests can verify scaling and quality without real canvas rendering.
 */
let lastToBlobCanvas: { readonly width: number; readonly height: number } | undefined;
let lastToBlobQuality: number | undefined;

/** Read a Blob as text using FileReader (works in JSDOM, unlike Blob.text/arrayBuffer). */
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error('FileReader failed', { cause: reader.error }));
    };

    reader.readAsText(blob);
  });
}

const mockCtx = {
  fillStyle: '',
  fillRect: jest.fn(),
  drawImage: jest.fn(),
  getImageData: jest.fn(),
  putImageData: jest.fn(),
};

/* Patch HTMLCanvasElement prototype so dynamically-created canvases also work. */
beforeEach(() => {
  lastToBlobCanvas = undefined;
  lastToBlobQuality = undefined;

  HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
    if (contextId === '2d') {
      return mockCtx as unknown as CanvasRenderingContext2D;
    }

    return null;
  }) as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback, type?: string, quality?: unknown) {
    lastToBlobCanvas = { width: this.width, height: this.height };
    lastToBlobQuality = typeof quality === 'number' ? quality : undefined;

    const mime = type ?? 'image/png';
    const blob =
      mime === 'image/jpeg' ?
        new Blob([JPEG_HEADER], { type: 'image/jpeg' })
      : new Blob([PNG_HEADER], { type: 'image/png' });

    callback(blob);
  };

  HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
    return 'data:image/png;base64,iVBORw0KGgoAAAANS';
  };
});

function createMockCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function createMarkedCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = createMockCanvas(width, height);

  canvas.setAttribute(CANVAS_MARKER, 'true');
  document.body.appendChild(canvas);

  return canvas;
}

/* ------------------------------------------------------------------ */
/*  PNG Raster Export                                                 */
/* ------------------------------------------------------------------ */

describe('PNG Raster Export', () => {
  /** @description Validates PNG at 1x: correct MIME and dimensions match source. */
  it('exports PNG with correct MIME type and dimensions at pixel ratio 1', async () => {
    const canvas = createMockCanvas(200, 100);
    const blob = await exportPngBlob(canvas, { pixelRatio: 1 });

    expect(blob.type).toBe('image/png');
    expect(lastToBlobCanvas).toEqual({ width: 200, height: 100 });
  });

  /** @description Validates PNG at 2x: output pixel dimensions are doubled. */
  it('doubles dimensions for pixel ratio 2', async () => {
    const canvas = createMockCanvas(200, 100);
    const blob = await exportPngBlob(canvas, { pixelRatio: 2 });

    expect(blob.type).toBe('image/png');
    expect(lastToBlobCanvas).toEqual({ width: 400, height: 200 });
  });

  /** @description Validates that PNG export ignores quality parameter (always lossless). */
  it('ignores quality parameter for PNG', async () => {
    const canvas = createMockCanvas(200, 100);

    await exportPngBlob(canvas, { pixelRatio: 1, quality: 0.5 });

    expect(lastToBlobQuality).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  JPEG Raster Export                                                */
/* ------------------------------------------------------------------ */

describe('JPEG Raster Export', () => {
  /** @description Validates JPEG at 1x: correct MIME and dimensions match source. */
  it('exports JPEG with correct MIME type and dimensions at pixel ratio 1', async () => {
    const canvas = createMockCanvas(200, 100);
    const blob = await exportJpegBlob(canvas, { pixelRatio: 1 });

    expect(blob.type).toBe('image/jpeg');
    expect(lastToBlobCanvas).toEqual({ width: 200, height: 100 });
  });

  /** @description Validates JPEG at 2x: output pixel dimensions are doubled. */
  it('doubles dimensions for pixel ratio 2', async () => {
    const canvas = createMockCanvas(200, 100);
    const blob = await exportJpegBlob(canvas, { pixelRatio: 2 });

    expect(blob.type).toBe('image/jpeg');
    expect(lastToBlobCanvas).toEqual({ width: 400, height: 200 });
  });

  /** @description Validates default JPEG quality is 0.92 when not specified. */
  it('uses default quality of 0.92', async () => {
    const canvas = createMockCanvas(200, 100);

    await exportJpegBlob(canvas, { pixelRatio: 1 });

    expect(lastToBlobQuality).toBe(0.92);
  });

  /** @description Validates that explicit quality parameter is passed to toBlob. */
  it('uses explicit quality parameter', async () => {
    const canvas = createMockCanvas(200, 100);

    await exportJpegBlob(canvas, { pixelRatio: 1, quality: 0.5 });

    expect(lastToBlobQuality).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/*  Canvas Element Discovery                                         */
/* ------------------------------------------------------------------ */

describe('Canvas Element Discovery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** @description Validates that discovery finds a mounted raster target with the canvas marker. */
  it('discovers mounted raster target with canvas marker', () => {
    const canvas = createMarkedCanvas(300, 200);
    const found = discoverCanvasElement();

    expect(found).toBe(canvas);
  });

  /** @description Validates that discovery returns null when no canvas marker is present. */
  it('returns null when no canvas marker is present', () => {
    const result = discoverCanvasElement();

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Embedded SVG Raster Export                                       */
/* ------------------------------------------------------------------ */

describe('Embedded SVG Raster Export', () => {
  /** @description Validates that embedded SVG blob contains valid SVG structure with correct dimensions. */
  it('produces valid SVG blob with correct structure', async () => {
    const canvas = createMockCanvas(200, 100);
    const blob = await exportEmbeddedSvgBlob(canvas);

    expect(blob.type).toBe('image/svg+xml');
    expect(blob.size).toBeGreaterThan(0);

    const text = await readBlobAsText(blob);

    expect(text).toContain('<svg');
    expect(text).toContain('<image');
    expect(text).toContain('width="200"');
    expect(text).toContain('height="100"');
  });

  /** @description Validates deterministic output for equivalent inputs. */
  it('produces deterministic output for equivalent inputs', async () => {
    const canvas1 = createMockCanvas(200, 100);
    const canvas2 = createMockCanvas(200, 100);
    const blob1 = await exportEmbeddedSvgBlob(canvas1);
    const blob2 = await exportEmbeddedSvgBlob(canvas2);
    const text1 = await readBlobAsText(blob1);
    const text2 = await readBlobAsText(blob2);

    expect(text1).toBe(text2);
  });
});

/* ------------------------------------------------------------------ */
/*  WebM Alpha Video Export                                          */
/* ------------------------------------------------------------------ */

describe('WebM Alpha Video Export', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)['VideoEncoder'] = function StubVideoEncoder() {
      /* stub */
    };

    mockWebMState.canvasSourceCalls = [];
    mockWebMState.canvasSourceConfig = undefined;
    mockWebMState.outputFinalized = false;
    mockWebMState.bufferContents = null;
    mockWebMState.webmFormatCreated = false;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['VideoEncoder'];
  });

  /** @description Validates that alpha:true configures VP9 encoder for alpha channel preservation. */
  it('preserves alpha channel when alpha is true', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { alpha: true, durationMs: 1000, frameRate: 10 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.canvasSourceConfig).toMatchObject({ alpha: 'keep', codec: 'vp9' });
  });

  /** @description Validates that alpha:false configures VP9 encoder for opaque output. */
  it('produces opaque output when alpha is false', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { alpha: false, durationMs: 1000, frameRate: 10 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.canvasSourceConfig).toMatchObject({ alpha: 'discard', codec: 'vp9' });
  });

  /** @description Validates that default quality of 0.8 maps to expected bitrate. */
  it('uses default quality of 0.8 when not specified', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 100, frameRate: 10 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.canvasSourceConfig).toMatchObject({ bitrate: Math.round(0.8 * 4_000_000) });
  });

  /** @description Validates correct frame count: 5s × 50fps = 250 frames via mediabunny CanvasSource.add calls. */
  it('captures correct number of frames for duration and frame rate', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 5000, frameRate: 50 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.outputFinalized).toBe(true);
    expect(mockWebMState.canvasSourceCalls).toHaveLength(250);
  });

  /** @description Validates that default frame rate of 50 is used when not specified, producing 50 frames for 1s. */
  it('uses default frame rate of 50 when not specified', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 1000 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.canvasSourceCalls).toHaveLength(50);
  });

  /** @description Validates output blob is WebM MIME and downloadable. */
  it('returns a downloadable WebM blob', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 200, frameRate: 10 };
    const blob = await exportWebMBlob(canvas, opts, () => {});

    expect(blob.type).toBe('video/webm');
    expect(blob.size).toBeGreaterThan(0);
  });

  /** @description Validates that render callback is called with correct time values. */
  it('calls renderFrame with correct time values', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 200, frameRate: 10 };
    const times: number[] = [];

    await exportWebMBlob(canvas, opts, (timeMs) => {
      times.push(timeMs);
    });

    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(100);
  });

  /** @description Validates that export throws when VideoEncoder is unavailable. */
  it('throws when VideoEncoder is unavailable', async () => {
    delete (globalThis as Record<string, unknown>)['VideoEncoder'];

    const canvas = createMockCanvas(320, 240);

    await expect(exportWebMBlob(canvas, { durationMs: 1000 }, () => {})).rejects.toThrow(
      'WebM export requires the VideoEncoder API',
    );
  });

  /** @description Validates that mediabunny WebMOutputFormat is used for container muxing. */
  it('uses WebMOutputFormat via mediabunny', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 100, frameRate: 10 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.webmFormatCreated).toBe(true);
    expect(mockWebMState.outputFinalized).toBe(true);
  });

  /** @description Validates mediabunny CanvasSource receives correct frame timestamps in seconds. */
  it('passes correct timestamps to canvasSource.add', async () => {
    const canvas = createMockCanvas(320, 240);
    const opts: WebMExportOptions = { durationMs: 300, frameRate: 10 };

    await exportWebMBlob(canvas, opts, () => {});

    expect(mockWebMState.canvasSourceCalls).toHaveLength(3);
    expect(mockWebMState.canvasSourceCalls[0]?.timestamp).toBeCloseTo(0);
    expect(mockWebMState.canvasSourceCalls[1]?.timestamp).toBeCloseTo(0.1);
    expect(mockWebMState.canvasSourceCalls[2]?.timestamp).toBeCloseTo(0.2);
  });
});

/* ------------------------------------------------------------------ */
/*  Download Wrapper                                                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Renderer Root Discovery                                          */
/* ------------------------------------------------------------------ */

describe('Renderer Root Discovery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** @description discoverRendererRoot MUST find the renderer's content root element by its data-broadset-canvas-root attribute. This is needed to capture DOM-rendered frames for video export. */
  it('discovers the renderer root element when marked', () => {
    const root = document.createElement('div');

    root.setAttribute('data-broadset-canvas-root', 'true');
    document.body.appendChild(root);

    expect(discoverRendererRoot()).toBe(root);
  });

  /** @description discoverRendererRoot MUST return null when no renderer root exists. */
  it('returns null when no renderer root is present', () => {
    expect(discoverRendererRoot()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  modern-screenshot mock (jsdom lacks real SVG rendering; mock     */
/*  returns a canvas with the requested size)                        */
/* ------------------------------------------------------------------ */

var mockDomToCanvas = jest.fn();

jest.mock('modern-screenshot', () => ({
  domToCanvas: mockDomToCanvas,
}));

/* ------------------------------------------------------------------ */
/*  DOM Element to Canvas Capture                                    */
/* ------------------------------------------------------------------ */

describe('captureElementToCanvas', () => {
  beforeEach(() => {
    mockDomToCanvas.mockImplementation((_node: unknown, options: unknown) => {
      const opts = options as { readonly width: number; readonly height: number };
      const canvas = document.createElement('canvas');

      canvas.width = opts.width;
      canvas.height = opts.height;

      return Promise.resolve(canvas);
    });
  });

  /** @description captureElementToCanvas MUST convert a DOM element to a canvas of the specified dimensions using modern-screenshot. This enables video export from the DOM-based renderer. */
  it('converts a DOM element to a canvas with specified dimensions', async () => {
    const element = document.createElement('div');

    element.style.width = '200px';
    element.style.height = '100px';
    element.style.backgroundColor = '#ff0000';
    document.body.appendChild(element);

    const canvas = await captureElementToCanvas(element, 200, 100);

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(mockDomToCanvas).toHaveBeenCalledWith(element, {
      width: 200,
      height: 100,
      scale: 1,
      drawImageInterval: 0,
    });

    document.body.removeChild(element);
  });
});

/* ------------------------------------------------------------------ */
/*  Download Wrapper                                                 */
/* ------------------------------------------------------------------ */

describe('Raster Download Wrapper', () => {
  /** @description Validates that download wrapper triggers download with the correct filename. */
  it('triggers download with requested filename', () => {
    let capturedDownload = '';
    let capturedHref = '';

    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      capturedDownload = this.download;
      capturedHref = this.href;
    });

    (globalThis as Record<string, unknown>)['URL'] = {
      ...URL,
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: jest.fn(),
    };

    const blob = new Blob(['test'], { type: 'image/png' });

    triggerDownload(blob, 'my-export.png');

    expect(capturedDownload).toBe('my-export.png');
    expect(capturedHref).toContain('blob:');

    jest.restoreAllMocks();
  });
});
