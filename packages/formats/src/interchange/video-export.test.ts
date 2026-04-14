import { describe, expect, it } from '@jest/globals';

import { exportVideoBlob, isVideoExportSupported } from './index';

describe('Video Export Support Detection', () => {
  /** @description Validates that JSDOM without VideoEncoder reports unsupported. */
  it('returns false in JSDOM (no VideoEncoder)', () => {
    expect(isVideoExportSupported()).toBe(false);
  });

  /** @description Validates that a mock VideoEncoder reports supported. */
  it('returns true when VideoEncoder is defined', () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = { isSupported: () => true };
      expect(isVideoExportSupported()).toBe(true);
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }
    }
  });

  /** @description Validates that exportVideoBlob rejects when VideoEncoder is unavailable. */
  it('rejects with an error when VideoEncoder is not available', async () => {
    const dummyCanvas = { width: 100, height: 100 } as HTMLCanvasElement;

    await expect(
      exportVideoBlob({
        canvas: dummyCanvas,
        renderFrame: () => {
          /* noop */
        },
        durationMs: 1000,
      }),
    ).rejects.toThrow('VideoEncoder API is unavailable');
  });

  /** @description Validates that frameRate must be positive. */
  it('rejects with error for non-positive frameRate', async () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = class MockVideoEncoder {
        configure(): void {
          /* noop */
        }
      };

      const dummyCanvas = { width: 100, height: 100 } as HTMLCanvasElement;

      await expect(
        exportVideoBlob({
          canvas: dummyCanvas,
          renderFrame: () => {
            /* noop */
          },
          durationMs: 1000,
          frameRate: 0,
        }),
      ).rejects.toThrow('frameRate must be positive');
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }
    }
  });

  /** @description Validates that durationMs must be positive. */
  it('rejects with error for non-positive durationMs', async () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = class MockVideoEncoder {
        configure(): void {
          /* noop */
        }
      };

      const dummyCanvas = { width: 100, height: 100 } as HTMLCanvasElement;

      await expect(
        exportVideoBlob({
          canvas: dummyCanvas,
          renderFrame: () => {
            /* noop */
          },
          durationMs: 0,
        }),
      ).rejects.toThrow('durationMs must be positive');
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }
    }
  });

  /** @description Validates that onProgress callback receives values between 0 and 1. */
  it('invokes onProgress callback with values in [0, 1]', async () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];
    const originalVideoFrame = (globalThis as Record<string, unknown>)['VideoFrame'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = class MockVideoEncoder {
        readonly #output: (chunk: { readonly byteLength: number; copyTo: (dest: Uint8Array) => void }) => void;

        constructor(init: {
          output: (chunk: { readonly byteLength: number; copyTo: (dest: Uint8Array) => void }) => void;
        }) {
          this.#output = init.output;
        }

        configure(): void {
          /* noop */
        }

        encode(): void {
          const chunk = {
            byteLength: 4,
            copyTo: (dest: Uint8Array) => {
              dest[0] = 0;
              dest[1] = 0;
              dest[2] = 0;
              dest[3] = 0;
            },
          };

          this.#output(chunk);
        }

        flush(): Promise<void> {
          return Promise.resolve();
        }
      };

      (globalThis as Record<string, unknown>)['VideoFrame'] = class MockVideoFrame {
        close(): void {
          /* noop */
        }
      };

      const progressValues: number[] = [];
      const stages: string[] = [];
      const dummyCanvas = { width: 100, height: 100 } as HTMLCanvasElement;

      await exportVideoBlob({
        canvas: dummyCanvas,
        renderFrame: () => {
          /* noop */
        },
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
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }

      if (originalVideoFrame === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoFrame'];
      } else {
        (globalThis as Record<string, unknown>)['VideoFrame'] = originalVideoFrame;
      }
    }
  });

  /** @description Validates that encoder errors are caught and reject the promise. */
  it('rejects with error when VideoEncoder fires error callback', async () => {
    const original = (globalThis as Record<string, unknown>)['VideoEncoder'];
    const originalVideoFrame = (globalThis as Record<string, unknown>)['VideoFrame'];

    try {
      (globalThis as Record<string, unknown>)['VideoEncoder'] = class MockVideoEncoder {
        #errorCb: (err: DOMException) => void;

        constructor(init: { output: () => void; error: (err: DOMException) => void }) {
          this.#errorCb = init.error;
        }

        configure(): void {
          /* noop */
        }

        encode(): void {
          this.#errorCb(new DOMException('Codec not supported'));
        }

        flush(): Promise<void> {
          return Promise.resolve();
        }
      };

      (globalThis as Record<string, unknown>)['VideoFrame'] = class MockVideoFrame {
        close(): void {
          /* noop */
        }
      };

      const dummyCanvas = { width: 100, height: 100 } as HTMLCanvasElement;

      await expect(
        exportVideoBlob({
          canvas: dummyCanvas,
          renderFrame: () => {
            /* noop */
          },
          durationMs: 100,
          frameRate: 10,
        }),
      ).rejects.toThrow('VideoEncoder error during video export');
    } finally {
      if (original === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoEncoder'];
      } else {
        (globalThis as Record<string, unknown>)['VideoEncoder'] = original;
      }

      if (originalVideoFrame === undefined) {
        delete (globalThis as Record<string, unknown>)['VideoFrame'];
      } else {
        (globalThis as Record<string, unknown>)['VideoFrame'] = originalVideoFrame;
      }
    }
  });
});
