import { describe, expect, it, vi } from 'vitest';

import {
  parsePdfInIsolationV1,
  type PdfIsolationWorkerHandlersV1,
  type PdfIsolationWorkerV1,
} from './isolation';

class ImmediateWorker implements PdfIsolationWorkerV1 {
  readonly terminate = vi.fn();

  parse(_bytes: Uint8Array, handlers: PdfIsolationWorkerHandlersV1): void {
    handlers.resolve({ kind: 'ok', parsed: undefined });
  }
}

class ErrorWorker implements PdfIsolationWorkerV1 {
  readonly terminate = vi.fn();

  parse(_bytes: Uint8Array, handlers: PdfIsolationWorkerHandlersV1): void {
    handlers.reject('worker failed');
  }
}

class HangingWorker implements PdfIsolationWorkerV1 {
  readonly terminate = vi.fn();

  parse(_bytes: Uint8Array, _handlers: PdfIsolationWorkerHandlersV1): void {}
}

class ThrowingTerminateWorker extends ImmediateWorker {
  override readonly terminate = vi.fn((): never => {
    throw new Error('termination failed');
  });
}

describe('PDF parser isolation boundary', () => {
  it('uses and terminates the owned worker after success', async () => {
    const worker = new ImmediateWorker();
    const result = await parsePdfInIsolationV1({ bytes: new Uint8Array([1]), createWorker: () => worker });

    expect(result).toEqual({ kind: 'ok', parsed: undefined });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('fails soft and terminates the worker after an error', async () => {
    const worker = new ErrorWorker();
    const result = await parsePdfInIsolationV1({ bytes: new Uint8Array([1]), createWorker: () => worker });

    expect(result).toEqual({ kind: 'isolation-failed', message: 'worker failed' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('fails closed when an available worker cannot be created', async () => {
    const result = await parsePdfInIsolationV1({
      bytes: new Uint8Array([1]),
      createWorker: (): PdfIsolationWorkerV1 => {
        throw new Error('worker construction blocked');
      },
    });

    expect(result).toEqual({ kind: 'isolation-failed', message: 'worker construction blocked' });
  });

  it('fails closed when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined);

    try {
      await expect(parsePdfInIsolationV1({ bytes: new Uint8Array([1]) })).resolves.toEqual({
        kind: 'isolation-failed',
        message: 'PDF worker is unavailable.',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('settles even when worker termination reports an error', async () => {
    const worker = new ThrowingTerminateWorker();

    await expect(
      parsePdfInIsolationV1({ bytes: new Uint8Array([1]), createWorker: () => worker }),
    ).resolves.toEqual({ kind: 'ok', parsed: undefined });
  });

  it('times out and terminates a hung worker', async () => {
    const worker = new HangingWorker();
    const result = await parsePdfInIsolationV1({
      bytes: new Uint8Array([1]),
      createWorker: () => worker,
      timeoutMs: 1,
    });

    expect(result).toEqual({ kind: 'timeout' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
