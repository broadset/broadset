/** @vitest-environment jsdom */

import type { BroadsetDocument } from '@broadset/model';
import { createEmptyBroadsetDocument } from '@broadset/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ExportContext, exportDocument, importDocument, loadFormats, resetFormatsCache } from './formatBridge';

/* ------------------------------------------------------------------ */
/*  Mock dynamic import('@broadset/formats')                          */
/* ------------------------------------------------------------------ */

const mockTriggerDownload = vi.fn();
const mockSanitizeFilename = vi.fn((name: string) => name.replace(/\s+/g, '-'));
const mockExportSvgString = vi.fn(() => Promise.resolve('<svg></svg>'));
const mockExportSvgDocument = vi.fn(() => Promise.resolve({ svg: '<svg></svg>', warnings: [] as readonly string[] }));
const mockBuildSvgFontSourcesFromAssets = vi.fn(() => new Map<string, unknown>());
const mockExportHtmlStandalone = vi.fn(() => '<html></html>');
const mockExportPdfBytes = vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])));
const mockExportPptxBytes = vi.fn(() => new Uint8Array([4, 5, 6]));

interface MockPptxWarning {
  readonly code: string;
  readonly message: string;
  readonly elementId?: string;
}

const mockExportPptxWithReportAsync = vi.fn(
  async (): Promise<{ bytes: Uint8Array; warnings: readonly MockPptxWarning[] }> =>
    Promise.resolve({ bytes: new Uint8Array([4, 5, 6]), warnings: [] }),
);
const mockExportPsdBytes = vi.fn(() => new Uint8Array([7, 8, 9]));
const mockExportPsdBytesAsync = vi.fn(() => Promise.resolve(new Uint8Array([7, 8, 9])));
const mockExportPngBlob = vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' })));
const mockExportJpegBlob = vi.fn(() => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' })));
const mockExportEmbeddedSvgBlob = vi.fn(() => Promise.resolve(new Blob(['svg'], { type: 'image/svg+xml' })));
const mockExportVideoBlob = vi.fn(() => Promise.resolve(new Blob(['video'], { type: 'video/webm' })));
const mockExportWebMBlob = vi.fn(() => Promise.resolve(new Blob(['webm'], { type: 'video/webm' })));
const mockGenerateOGrafPackages = vi.fn(() => []);
const mockImportPsdDocument = vi.fn(() => ({
  document: { ...createEmptyBroadsetDocument(), name: 'Imported PSD' } satisfies BroadsetDocument,
  warnings: [] as string[],
}));
const mockImportPptxDocument = vi.fn(async () =>
  Promise.resolve({
    document: { ...createEmptyBroadsetDocument(), name: 'Imported PPTX' } satisfies BroadsetDocument,
    warnings: [] as string[],
  }),
);
const mockImportSvgDocument = vi.fn(() => ({
  document: { ...createEmptyBroadsetDocument(), name: 'Imported SVG' } satisfies BroadsetDocument,
  warnings: [] as string[],
}));
const mockImportPdfDocument = vi.fn(() =>
  Promise.resolve({
    document: { ...createEmptyBroadsetDocument(), name: 'Imported PDF' } satisfies BroadsetDocument,
    warnings: [] as string[],
  }),
);
const mockExportProjectJson = vi.fn(() => '{}');
const mockDiscoverCanvasElement = vi.fn(() => null);

const mockFormats = {
  buildSvgFontSourcesFromAssets: mockBuildSvgFontSourcesFromAssets,
  discoverCanvasElement: mockDiscoverCanvasElement,
  exportEmbeddedSvgBlob: mockExportEmbeddedSvgBlob,
  exportHtmlStandalone: mockExportHtmlStandalone,
  exportJpegBlob: mockExportJpegBlob,
  exportPdfBytes: mockExportPdfBytes,
  exportPngBlob: mockExportPngBlob,
  exportPptxBytes: mockExportPptxBytes,
  exportPptxWithReportAsync: mockExportPptxWithReportAsync,
  exportProjectJson: mockExportProjectJson,
  exportPsdBytes: mockExportPsdBytes,
  exportPsdBytesAsync: mockExportPsdBytesAsync,
  exportSvgDocument: mockExportSvgDocument,
  exportSvgString: mockExportSvgString,
  exportVideoBlob: mockExportVideoBlob,
  exportWebMBlob: mockExportWebMBlob,
  generateOGrafPackages: mockGenerateOGrafPackages,
  importPdfDocument: mockImportPdfDocument,
  importPptxDocument: mockImportPptxDocument,
  importPsdDocument: mockImportPsdDocument,
  importSvgDocument: mockImportSvgDocument,
  sanitizeFilename: mockSanitizeFilename,
  triggerDownload: mockTriggerDownload,
};

vi.mock('@broadset/formats', () => mockFormats);

/**
 * JSDOM's File/Blob may not support `.text()` or `.arrayBuffer()`.
 * Create test files with explicit polyfill for these methods.
 */
function createTestFile(content: string | Uint8Array, name: string, type: string): File {
  const blobPart: BlobPart = typeof content === 'string' ? content : (content.buffer as ArrayBuffer);
  const blob = new Blob([blobPart], { type });
  const file = new File([blob], name, { type });

  // Polyfill .text() using FileReader
  if (typeof file.text !== 'function') {
    (file as { text: () => Promise<string> }).text = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result as string);
        };

        reader.onerror = () => {
          reject(new Error(String(reader.error)));
        };

        reader.readAsText(blob);
      });
  }

  // Polyfill .arrayBuffer() using FileReader
  if (typeof file.arrayBuffer !== 'function') {
    (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result as ArrayBuffer);
        };

        reader.onerror = () => {
          reject(new Error(String(reader.error)));
        };

        reader.readAsArrayBuffer(blob);
      });
  }

  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFormatsCache();
});

/* ================================================================== */
/*  Lazy Format Loading                                               */
/* ================================================================== */

describe('lazy format loading', () => {
  /** @description The formats module MUST NOT be loaded until the first export or import triggers it. */
  it('loads the formats module on first call', async () => {
    const formats = await loadFormats();

    expect(formats.exportSvgString).toBe(mockExportSvgString);
    expect(formats.triggerDownload).toBe(mockTriggerDownload);
  });

  /** @description Subsequent calls MUST reuse the cached module to avoid redundant dynamic imports. */
  it('returns the same cached module on subsequent calls', async () => {
    const first = await loadFormats();
    const second = await loadFormats();

    expect(first).toBe(second);
  });
});

/* ================================================================== */
/*  Export Orchestration                                               */
/* ================================================================== */

describe('export orchestration', () => {
  const makeContext = (overrides?: Partial<ExportContext>): ExportContext => ({
    document: createEmptyBroadsetDocument(),
    ...overrides,
  });

  /** @description SVG export MUST call exportSvgDocument and trigger a file download. */
  it('exports SVG format and triggers download', async () => {
    await exportDocument('svg', makeContext());

    expect(mockExportSvgDocument).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [blob, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/\.svg$/);
  });

  /** @description HTML export MUST call exportHtmlStandalone and trigger a file download. */
  it('exports HTML format and triggers download', async () => {
    await exportDocument('html', makeContext());

    expect(mockExportHtmlStandalone).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.html$/);
  });

  /** @description PDF export MUST call exportPdfBytes and trigger a file download. */
  it('exports PDF format and triggers download', async () => {
    await exportDocument('pdf', makeContext());

    expect(mockExportPdfBytes).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.pdf$/);
  });

  /** @description PPTX export MUST call exportPptxWithReportAsync and trigger a file download. */
  it('exports PPTX format and triggers download', async () => {
    const result = await exportDocument('pptx', makeContext());

    expect(mockExportPptxWithReportAsync).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.pptx$/);
  });

  /** @description PPTX export MUST surface export warnings in the result so the UI can toast them. */
  it('propagates PPTX exporter warnings up to the caller', async () => {
    mockExportPptxWithReportAsync.mockResolvedValueOnce({
      bytes: new Uint8Array([4, 5, 6]),
      warnings: [
        { code: 'shadow-inset-skipped', message: 'inset shadow skipped', elementId: 'el-1' },
        { code: 'animation-preset-unsupported', message: 'colour fade unsupported', elementId: 'el-2' },
      ],
    });

    const result = await exportDocument('pptx', makeContext());

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('shadow-inset-skipped');
    expect(result.warnings[1]).toContain('animation-preset-unsupported');
  });

  /** @description PSD export MUST call exportPsdBytesAsync and trigger a file download. */
  it('exports PSD format and triggers download', async () => {
    await exportDocument('psd', makeContext());

    expect(mockExportPsdBytesAsync).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.psd$/);
  });

  /** @description PNG raster export MUST require a snapshotCanvas and trigger a file download. */
  it('exports PNG format when a snapshot canvas is provided', async () => {
    const canvas = document.createElement('canvas');

    await exportDocument('png', makeContext({ snapshotCanvas: canvas }));

    expect(mockExportPngBlob).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.png$/);
  });

  /** @description PNG export must forward pixel ratio overrides from export context. */
  it('forwards custom pixel ratio for PNG export', async () => {
    const canvas = document.createElement('canvas');

    await exportDocument('png', makeContext({ pixelRatio: 3, snapshotCanvas: canvas }));

    const calls = (mockExportPngBlob as unknown as { readonly mock: { readonly calls: readonly unknown[][] } }).mock
      .calls;
    const firstCall = calls[0];

    if (firstCall === undefined) {
      throw new Error('Expected exportPngBlob to be called');
    }

    const calledCanvas = firstCall[0] as HTMLCanvasElement;
    const calledOptions = firstCall[1] as { readonly pixelRatio: number };

    expect(calledCanvas).toBe(canvas);
    expect(calledOptions.pixelRatio).toBe(3);
  });

  /** @description JPEG raster export MUST require a snapshotCanvas and trigger a file download. */
  it('exports JPEG format when a snapshot canvas is provided', async () => {
    const canvas = document.createElement('canvas');

    await exportDocument('jpeg', makeContext({ snapshotCanvas: canvas }));

    expect(mockExportJpegBlob).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.jpe?g$/);
  });

  /** @description Raster export without a snapshot renderer MUST raise an error. */
  it('throws when a raster export has no snapshot canvas', async () => {
    await expect(exportDocument('png', makeContext())).rejects.toThrow(/snapshot/i);
  });

  /** @description SVG-embedded raster export MUST require a snapshotCanvas. */
  it('exports SVG-embedded format when a snapshot canvas is provided', async () => {
    const canvas = document.createElement('canvas');

    await exportDocument('svg-embedded', makeContext({ snapshotCanvas: canvas }));

    expect(mockExportEmbeddedSvgBlob).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
  });

  /** @description Video export (WebM) MUST require a renderFrame callback and durationMs. */
  it('exports WebM format with video settings', async () => {
    const renderFrame = vi.fn<(timeMs: number) => void>();
    const canvas = document.createElement('canvas');

    await exportDocument(
      'webm',
      makeContext({
        snapshotCanvas: canvas,
        renderFrame,
        playbackDurationMs: 5000,
        videoFrameRate: 30,
      }),
    );

    expect(mockExportVideoBlob).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const [, filename] = mockTriggerDownload.mock.calls[0] as [Blob, string];

    expect(filename).toMatch(/\.webm$/);
  });

  /** @description WebM export must forward frame rate and quality overrides from export context. */
  it('forwards custom frame rate and quality for WebM export', async () => {
    const renderFrame = vi.fn<(timeMs: number) => void>();
    const canvas = document.createElement('canvas');

    await exportDocument(
      'webm',
      makeContext({
        snapshotCanvas: canvas,
        renderFrame,
        playbackDurationMs: 5000,
        videoFrameRate: 60,
        videoQuality: 0.6,
      }),
    );

    const calls = (mockExportVideoBlob as unknown as { readonly mock: { readonly calls: readonly unknown[][] } }).mock
      .calls;
    const firstCall = calls[0];

    if (firstCall === undefined) {
      throw new Error('Expected exportVideoBlob to be called');
    }

    const calledOptions = firstCall[0] as {
      readonly frameRate: number;
      readonly format: string;
      readonly quality: number;
    };

    expect(calledOptions.frameRate).toBe(60);
    expect(calledOptions.format).toBe('webm');
    expect(calledOptions.quality).toBe(0.6);
  });

  /** @description MP4 export uses exportVideoBlob with format:'mp4' and triggers download. */
  it('exports MP4 video and triggers download', async () => {
    const renderFrame = vi.fn<(timeMs: number) => void>();
    const canvas = document.createElement('canvas');

    await exportDocument(
      'mp4',
      makeContext({
        snapshotCanvas: canvas,
        renderFrame,
        playbackDurationMs: 5000,
        videoFrameRate: 30,
      }),
    );

    expect(mockExportVideoBlob).toHaveBeenCalledTimes(1);

    const calledOptions = (mockExportVideoBlob.mock.calls as unknown[][])[0]?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(calledOptions?.['format']).toBe('mp4');
    expect(calledOptions?.['frameRate']).toBe(30);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);

    const downloadArgs = mockTriggerDownload.mock.calls[0] as readonly unknown[] | undefined;

    expect(downloadArgs).toBeDefined();
    expect(typeof downloadArgs?.[1]).toBe('string');
    expect((downloadArgs?.[1] as string).endsWith('.mp4')).toBe(true);
  });

  /** @description Video export without renderFrame MUST raise an error. */
  it('throws when a video export has no renderFrame', async () => {
    await expect(exportDocument('webm', makeContext())).rejects.toThrow(/playback/i);
  });

  /** @description Video export with renderFrame and duration but no snapshotCanvas MUST raise a snapshot canvas error. This test reproduces the runtime bug where the DOM renderer has no <canvas> element, so discoverCanvasElement returns null and the snapshot canvas is undefined. */
  it('throws when video export has renderFrame and duration but no snapshot canvas', async () => {
    const renderFrame = vi.fn<(timeMs: number) => void>();

    await expect(exportDocument('mp4', makeContext({ renderFrame, playbackDurationMs: 5000 }))).rejects.toThrow(
      /snapshot canvas/i,
    );
  });

  /** @description OGraf export MUST call generateOGrafPackages and trigger a download. */
  it('exports OGraf format and triggers download', async () => {
    await exportDocument('ograf', makeContext());

    expect(mockGenerateOGrafPackages).toHaveBeenCalledTimes(1);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
  });

  /** @description A failed export MUST propagate the error so callers can display an error toast. */
  it('propagates errors from format functions', async () => {
    mockExportSvgDocument.mockImplementationOnce(() => {
      throw new Error('SVG render failed');
    });

    await expect(exportDocument('svg', makeContext())).rejects.toThrow('SVG render failed');
  });
});

/* ================================================================== */
/*  Import Orchestration                                              */
/* ================================================================== */

describe('import orchestration', () => {
  /** @description JSON import MUST parse the file and return a valid BroadsetDocument. */
  it('imports a JSON document file', async () => {
    const doc = createEmptyBroadsetDocument();
    const file = createTestFile(JSON.stringify(doc), 'test.json', 'application/json');
    const result = await importDocument(file);

    expect(result.document.name).toBe(doc.name);
    expect(result.warnings).toEqual([]);
  });

  /** @description BSP files use the same JSON code path as .json files. */
  it('imports a .bsp document file', async () => {
    const doc = createEmptyBroadsetDocument();
    const file = createTestFile(JSON.stringify(doc), 'project.bsp', 'application/vnd.broadset.project+json');
    const result = await importDocument(file);

    expect(result.document.name).toBe(doc.name);
  });

  /** @description PSD import MUST call importPsd and return a BroadsetDocument. */
  it('imports a PSD file', async () => {
    const file = createTestFile(new Uint8Array([0, 1, 2]), 'design.psd', 'image/vnd.adobe.photoshop');
    const result = await importDocument(file);

    expect(mockImportPsdDocument).toHaveBeenCalledTimes(1);
    expect(result.document.name).toBe('Imported PSD');
  });

  /** @description PPTX import MUST call importPptx and return a BroadsetDocument. */
  it('imports a PPTX file', async () => {
    const file = createTestFile(
      new Uint8Array([0, 1, 2]),
      'slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    const result = await importDocument(file);

    expect(mockImportPptxDocument).toHaveBeenCalledTimes(1);
    expect(result.document.name).toBe('Imported PPTX');
  });

  /** @description SVG import MUST call importSvg and convert the result to a BroadsetDocument. */
  it('imports an SVG file', async () => {
    const file = createTestFile('<svg></svg>', 'graphic.svg', 'image/svg+xml');
    const result = await importDocument(file);

    expect(mockImportSvgDocument).toHaveBeenCalledTimes(1);
    expect(result.document).toBeDefined();
  });

  /** @description PDF import MUST call importPdfDocument (async) and return a BroadsetDocument. */
  it('imports a PDF file', async () => {
    const file = createTestFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'design.pdf', 'application/pdf');
    const result = await importDocument(file);

    expect(mockImportPdfDocument).toHaveBeenCalledTimes(1);
    expect(result.document.name).toBe('Imported PDF');
  });

  /** @description Import orchestration MUST preserve importer warnings so the demo shell can surface them to the user. */
  it('returns importer warnings for the caller to surface in the UI', async () => {
    mockImportSvgDocument.mockReturnValueOnce({
      document: { ...createEmptyBroadsetDocument(), name: 'Imported SVG' },
      warnings: ['Unsupported blend mode converted to fallback'],
    });

    const file = createTestFile('<svg></svg>', 'graphic.svg', 'image/svg+xml');
    const result = await importDocument(file);

    expect(result.warnings).toEqual(['Unsupported blend mode converted to fallback']);
  });

  /** @description Unsupported file extensions MUST throw an error so the caller can show a toast. */
  it('throws for unsupported file formats', async () => {
    const file = createTestFile('data', 'unknown.xyz', 'application/octet-stream');

    await expect(importDocument(file)).rejects.toThrow(/unsupported/i);
  });

  /** @description A failed import MUST propagate the error for the caller to display. */
  it('propagates errors from format import functions', async () => {
    mockImportPsdDocument.mockImplementationOnce(() => {
      throw new Error('PSD corrupted');
    });

    const file = createTestFile(new Uint8Array([0]), 'bad.psd', 'image/vnd.adobe.photoshop');

    await expect(importDocument(file)).rejects.toThrow('PSD corrupted');
  });

  /** @description JSON import MUST also accept BroadsetProject wrappers (array of documents). */
  it('unwraps a BroadsetProject wrapper during JSON import', async () => {
    const doc = { ...createEmptyBroadsetDocument(), name: 'Wrapped Doc' };
    const project = { documents: [doc], settings: {}, assets: [] };
    const file = createTestFile(JSON.stringify(project), 'project.json', 'application/json');
    const result = await importDocument(file);

    expect(result.document.name).toBe('Wrapped Doc');
  });
});
