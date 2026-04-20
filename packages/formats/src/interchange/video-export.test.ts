import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportVideoBlob, isVideoExportSupported } from './index';

/* ------------------------------------------------------------------ */
/*  mediabunny mock                                                  */
/* ------------------------------------------------------------------ */

/**
 * Mock mediabunny so tests run in JSDOM without real WebCodecs.
 * Captures constructor args and method calls for assertion.
 *
 * The mock state object is declared with `var` so it is hoisted above
 * the `vi.mock` factory (which babel hoists to the top of the file).
 */

interface MockCanvasSourceCall {
  readonly timestamp: unknown;
  readonly duration: unknown;
}

interface MockState {
  canvasSourceCalls: MockCanvasSourceCall[];
  canvasSourceConfig: unknown;
  outputFinalized: boolean;
  outputStarted: boolean;
  bufferContents: ArrayBuffer | null;
  finalizeError: Error | null;
  mp4FormatCreated: boolean;
  mp4FormatOptions: unknown;
  webmFormatCreated: boolean;
}

var mockState: MockState = {
  canvasSourceCalls: [],
  canvasSourceConfig: undefined,
  outputFinalized: false,
  outputStarted: false,
  bufferContents: null,
  finalizeError: null,
  mp4FormatCreated: false,
  mp4FormatOptions: undefined,
  webmFormatCreated: false,
};

vi.mock('mediabunny', () => ({
  BufferTarget: vi.fn(function MockBufferTarget(this: { buffer: ArrayBuffer | null }) {
    Object.defineProperty(this, 'buffer', {
      get() {
        return mockState.bufferContents;
      },
    });
  }),
  CanvasSource: vi.fn(function MockCanvasSource(
    this: { add: (timestamp: unknown, duration: unknown) => Promise<void> },
    _canvas: unknown,
    config: unknown,
  ) {
    mockState.canvasSourceConfig = config;
    this.add = vi.fn().mockImplementation((timestamp: unknown, duration: unknown) => {
      mockState.canvasSourceCalls.push({ timestamp, duration });

      return Promise.resolve();
    });
  }),
  Mp4OutputFormat: vi.fn(function MockMp4OutputFormat(
    this: { type: string; options: unknown },
    options: unknown,
  ) {
    mockState.mp4FormatCreated = true;
    mockState.mp4FormatOptions = options;
    this.type = 'mp4';
    this.options = options;
  }),
  WebMOutputFormat: vi.fn(function MockWebMOutputFormat(this: { type: string }) {
    mockState.webmFormatCreated = true;
    this.type = 'webm';
  }),
  Output: vi.fn(function MockOutput(this: {
    addVideoTrack: () => void;
    start: () => Promise<void>;
    finalize: () => Promise<void>;
  }) {
    this.addVideoTrack = vi.fn();
    this.start = vi.fn().mockImplementation(() => {
      mockState.outputStarted = true;

      return Promise.resolve();
    });
    this.finalize = vi.fn().mockImplementation(() => {
      if (mockState.finalizeError) {
        return Promise.reject(mockState.finalizeError);
      }

      mockState.outputFinalized = true;
      mockState.bufferContents = new ArrayBuffer(64);

      return Promise.resolve();
    });
  }),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                          */
/* ------------------------------------------------------------------ */

function makeDummyCanvas(): HTMLCanvasElement {
  return { width: 320, height: 240 } as HTMLCanvasElement;
}

function installVideoEncoder(): void {
  (globalThis as Record<string, unknown>)['VideoEncoder'] = function StubVideoEncoder() {
    /* stub */
  };
}

function removeVideoEncoder(): void {
  delete (globalThis as Record<string, unknown>)['VideoEncoder'];
}

/* ------------------------------------------------------------------ */
/*  Tests                                                            */
/* ------------------------------------------------------------------ */

describe('Video Export Support Detection', () => {
  /** @description isVideoExportSupported checks for the global VideoEncoder symbol. */
  it('returns false in JSDOM (no VideoEncoder)', () => {
    expect(isVideoExportSupported()).toBe(false);
  });

  /** @description When VideoEncoder is polyfilled/available, detection returns true. */
  it('returns true when VideoEncoder is defined', () => {
    installVideoEncoder();

    try {
      expect(isVideoExportSupported()).toBe(true);
    } finally {
      removeVideoEncoder();
    }
  });
});

describe('exportVideoBlob', () => {
  beforeEach(() => {
    installVideoEncoder();
    mockState.canvasSourceCalls = [];
    mockState.canvasSourceConfig = undefined;
    mockState.outputFinalized = false;
    mockState.outputStarted = false;
    mockState.bufferContents = null;
    mockState.finalizeError = null;
    mockState.mp4FormatCreated = false;
    mockState.mp4FormatOptions = undefined;
    mockState.webmFormatCreated = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    removeVideoEncoder();
  });

  /** @description Export must fail with a clear message when VideoEncoder is unavailable. */
  it('rejects when VideoEncoder is unavailable', async () => {
    removeVideoEncoder();

    const canvas = makeDummyCanvas();

    await expect(exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 1000 })).rejects.toThrow(
      'VideoEncoder API is unavailable',
    );
  });

  /** @description frameRate must be a positive number to prevent division by zero. */
  it('rejects for non-positive frameRate', async () => {
    const canvas = makeDummyCanvas();

    await expect(exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 1000, frameRate: 0 })).rejects.toThrow(
      'frameRate must be positive',
    );
  });

  /** @description durationMs must be a positive finite number to produce a bounded frame count. */
  it('rejects for non-positive or non-finite durationMs', async () => {
    const canvas = makeDummyCanvas();

    await expect(exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 0 })).rejects.toThrow(
      'durationMs must be a positive finite number',
    );
    await expect(exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: Infinity })).rejects.toThrow(
      'durationMs must be a positive finite number',
    );
  });

  /** @description Default format is WebM with VP9 codec using WebMOutputFormat. */
  it('defaults to WebM format with VP9 codec', async () => {
    const canvas = makeDummyCanvas();

    const blob = await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 });

    expect(mockState.webmFormatCreated).toBe(true);
    expect(mockState.mp4FormatCreated).toBe(false);
    expect(mockState.canvasSourceConfig).toMatchObject({ codec: 'vp9' });
    expect(blob.type).toBe('video/webm');
  });

  /** @description MP4 export uses Mp4OutputFormat with AVC (H.264) codec. */
  it('exports MP4 with AVC codec when format is mp4', async () => {
    const canvas = makeDummyCanvas();

    const blob = await exportVideoBlob({
      canvas,
      renderFrame: () => {},
      durationMs: 100,
      frameRate: 10,
      format: 'mp4',
    });

    expect(mockState.mp4FormatCreated).toBe(true);
    expect(mockState.mp4FormatOptions).toEqual({ fastStart: 'in-memory' });
    expect(mockState.webmFormatCreated).toBe(false);
    expect(mockState.canvasSourceConfig).toMatchObject({ codec: 'avc' });
    expect(blob.type).toBe('video/mp4');
  });

  /** @description MP4 always discards alpha (AVC doesn't support transparency). */
  it('discards alpha for MP4 even when alpha option is true', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({
      canvas,
      renderFrame: () => {},
      durationMs: 100,
      frameRate: 10,
      format: 'mp4',
      alpha: true,
    });

    expect(mockState.canvasSourceConfig).toMatchObject({ alpha: 'discard' });
  });

  /** @description WebM preserves alpha when requested (VP9 supports transparency). */
  it('preserves alpha for WebM when alpha option is true', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({
      canvas,
      renderFrame: () => {},
      durationMs: 100,
      frameRate: 10,
      alpha: true,
    });

    expect(mockState.canvasSourceConfig).toMatchObject({ alpha: 'keep', codec: 'vp9' });
  });

  /** @description WebM defaults to opaque when alpha is not specified. */
  it('defaults to opaque (discard alpha) for WebM', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 });

    expect(mockState.canvasSourceConfig).toMatchObject({ alpha: 'discard' });
  });

  /** @description Quality maps to bitrate proportional to MAX_VIDEO_BITRATE (4 Mbps). */
  it('maps quality to bitrate', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10, quality: 0.5 });

    expect(mockState.canvasSourceConfig).toMatchObject({ bitrate: Math.round(0.5 * 4_000_000) });
  });

  /** @description Default quality of 0.8 maps to 3.2 Mbps bitrate. */
  it('uses default quality of 0.8 when not specified', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 });

    expect(mockState.canvasSourceConfig).toMatchObject({ bitrate: Math.round(0.8 * 4_000_000) });
  });

  /** @description Quality must be in range [0, 1] to prevent nonsensical bitrate values. */
  it('rejects invalid quality outside [0, 1]', async () => {
    const canvas = makeDummyCanvas();

    await expect(
      exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10, quality: -0.1 }),
    ).rejects.toThrow('quality must be in range [0, 1]');

    await expect(
      exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10, quality: 1.5 }),
    ).rejects.toThrow('quality must be in range [0, 1]');
  });

  /** @description Correct number of frames for a 1s clip at 10fps = 10 frames. */
  it('captures correct number of frames', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 1000, frameRate: 10 });

    expect(mockState.canvasSourceCalls).toHaveLength(10);
  });

  /** @description Frame timestamps increase monotonically in seconds. */
  it('passes correct timestamps to canvasSource.add', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 300, frameRate: 10 });

    expect(mockState.canvasSourceCalls).toHaveLength(3);
    expect(mockState.canvasSourceCalls[0]?.timestamp).toBeCloseTo(0);
    expect(mockState.canvasSourceCalls[1]?.timestamp).toBeCloseTo(0.1);
    expect(mockState.canvasSourceCalls[2]?.timestamp).toBeCloseTo(0.2);
  });

  /** @description renderFrame callback receives time in milliseconds matching each frame. */
  it('calls renderFrame with correct millisecond timestamps', async () => {
    const canvas = makeDummyCanvas();
    const times: number[] = [];

    await exportVideoBlob({
      canvas,
      renderFrame: (timeMs) => {
        times.push(timeMs);
      },
      durationMs: 200,
      frameRate: 10,
    });

    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(100);
  });

  /** @description Progress callback starts at 0 and ends at 1, monotonically non-decreasing. */
  it('invokes onProgress callback with values in [0, 1]', async () => {
    const canvas = makeDummyCanvas();
    const progressValues: number[] = [];
    const stages: string[] = [];

    await exportVideoBlob({
      canvas,
      renderFrame: () => {},
      durationMs: 100,
      frameRate: 10,
      onProgress: (p, stage) => {
        progressValues.push(p);

        if (stage) stages.push(stage);
      },
    });

    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[0]).toBe(0);
    expect(progressValues[progressValues.length - 1]).toBe(1);

    for (const v of progressValues) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }

    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1] ?? 0);
    }

    expect(stages).toContain('Initializing encoder');
    expect(stages).toContain('Complete');
  });

  /** @description output.start() and output.finalize() form the proper lifecycle. */
  it('starts and finalizes the mediabunny output', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 });

    expect(mockState.outputStarted).toBe(true);
    expect(mockState.outputFinalized).toBe(true);
  });

  /** @description When finalize throws, the error propagates to the caller. */
  it('propagates finalization errors', async () => {
    mockState.finalizeError = new Error('Encoding failed');

    const canvas = makeDummyCanvas();

    await expect(exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 })).rejects.toThrow(
      'Encoding failed',
    );
  });

  /** @description The returned blob has non-zero size from the buffer target. */
  it('returns a blob with data', async () => {
    const canvas = makeDummyCanvas();

    const blob = await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 100, frameRate: 10 });

    expect(blob.size).toBeGreaterThan(0);
  });

  /** @description Default frameRate is 30 when not specified. */
  it('uses default frameRate of 30', async () => {
    const canvas = makeDummyCanvas();

    await exportVideoBlob({ canvas, renderFrame: () => {}, durationMs: 1000 });

    // 1s * 30fps = 30 frames
    expect(mockState.canvasSourceCalls).toHaveLength(30);
  });
});
