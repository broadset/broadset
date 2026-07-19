import { describe, expect, it, vi } from 'vitest';

import { parsePsdInIsolationV1 } from './import-isolation';
import type { PsdParseResultV1 } from './import-parse';

describe('PSD parser isolation', () => {
  it('fails closed when no isolated worker runtime exists', async () => {
    vi.stubGlobal('Worker', undefined);

    await expect(parsePsdInIsolationV1({ bytes: new Uint8Array([1]), maxResultBytes: 16 })).resolves.toEqual({
      kind: 'isolation-failed',
      message: 'PSD worker is unavailable.',
    });
    vi.unstubAllGlobals();
  });

  it('uses and terminates the owned worker on completion', async () => {
    const terminate = vi.fn();
    const parse = vi.fn((_input: WorkerInput, handlers: WorkerHandlers): void => {
      handlers.resolve({ kind: 'malformed', message: 'fixture' });
    });

    const result = await parsePsdInIsolationV1({
      bytes: new Uint8Array([1]),
      maxResultBytes: 16,
      createWorker: () => ({ parse, terminate }),
    });

    expect(result).toEqual({ kind: 'malformed', message: 'fixture' });
    expect(parse).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('terminates and fails soft on worker errors', async () => {
    const terminate = vi.fn();

    const result = await parsePsdInIsolationV1({
      bytes: new Uint8Array([1]),
      maxResultBytes: 16,
      createWorker: () => ({
        parse: (_input: WorkerInput, handlers: WorkerHandlers): void => { handlers.reject('worker error'); },
        terminate,
      }),
    });

    expect(result).toEqual({ kind: 'isolation-failed', message: 'worker error' });
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('terminates a worker that exceeds the timeout', async () => {
    vi.useFakeTimers();

    const terminate = vi.fn();
    const promise = parsePsdInIsolationV1({
      bytes: new Uint8Array([1]),
      maxResultBytes: 16,
      timeoutMs: 1,
      createWorker: () => ({ parse: (): void => undefined, terminate }),
    });

    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({ kind: 'timeout' });
    expect(terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

interface WorkerHandlers {
  readonly resolve: (result: PsdParseResultV1) => void;
  readonly reject: (message: string) => void;
}

interface WorkerInput {
  readonly bytes: Uint8Array;
  readonly maxResultBytes: number;
}
