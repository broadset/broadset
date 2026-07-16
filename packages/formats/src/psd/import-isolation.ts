import { type PsdParseResultV1 } from './import-parse';

const DEFAULT_TIMEOUT_MS = 30_000;

interface PsdIsolationWorkerV1 {
  parse(
    input: { readonly bytes: Uint8Array; readonly maxResultBytes: number },
    handlers: {
      readonly resolve: (result: PsdParseResultV1) => void;
      readonly reject: (message: string) => void;
    },
  ): void;
  terminate(): void;
}

type PsdIsolationResultV1 =
  | PsdParseResultV1
  | { readonly kind: 'isolation-failed'; readonly message: string }
  | { readonly kind: 'timeout' };

export async function parsePsdInIsolationV1(input: {
  readonly bytes: Uint8Array;
  readonly maxResultBytes: number;
  readonly createWorker?: () => PsdIsolationWorkerV1;
  readonly timeoutMs?: number;
}): Promise<PsdIsolationResultV1> {
  const owned = createWorker(input.createWorker);

  if (owned.kind === 'unavailable') {
    return { kind: 'isolation-failed', message: 'PSD worker is unavailable.' };
  }

  if (owned.kind === 'failed') return { kind: 'isolation-failed', message: owned.message };

  const worker = owned.worker;

  return new Promise((resolve) => {
    let settled = false;
    const timer = globalThis.setTimeout((): void => {
      finish({ kind: 'timeout' });
    }, validTimeout(input.timeoutMs));
    const finish = (result: PsdIsolationResultV1): void => {
      if (settled) return;

      settled = true;
      globalThis.clearTimeout(timer);

      try {
        worker.terminate();
      } finally {
        resolve(result);
      }
    };

    try {
      worker.parse({ bytes: input.bytes, maxResultBytes: input.maxResultBytes }, {
        resolve: finish,
        reject: (message: string): void => {
          finish({ kind: 'isolation-failed', message });
        },
      });
    } catch (error: unknown) {
      finish({
        kind: 'isolation-failed',
        message: error instanceof Error ? error.message : 'PSD worker failed to start.',
      });
    }
  });
}

type OwnedPsdWorker =
  | { readonly kind: 'worker'; readonly worker: PsdIsolationWorkerV1 }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

function createWorker(factory: (() => PsdIsolationWorkerV1) | undefined): OwnedPsdWorker {
  if (factory !== undefined) {
    try {
      return { kind: 'worker', worker: factory() };
    } catch (error: unknown) {
      return { kind: 'failed', message: error instanceof Error ? error.message : 'PSD worker failed to start.' };
    }
  }

  if (typeof Worker === 'undefined') return { kind: 'unavailable' };

  try {
    return { kind: 'worker', worker: new BrowserPsdIsolationWorker() };
  } catch (error: unknown) {
    return { kind: 'failed', message: error instanceof Error ? error.message : 'PSD worker failed to start.' };
  }
}

function validTimeout(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

class BrowserPsdIsolationWorker implements PsdIsolationWorkerV1 {
  readonly #worker: Worker;

  constructor() {
    this.#worker = new Worker(new URL('./worker-runtime.ts', import.meta.url), {
      type: 'module',
      name: 'broadset-psd-import',
    });
  }

  parse(
    input: { readonly bytes: Uint8Array; readonly maxResultBytes: number },
    handlers: { readonly resolve: (result: PsdParseResultV1) => void; readonly reject: (message: string) => void },
  ): void {
    this.#worker.onmessage = (event: MessageEvent<PsdParseResultV1>): void => {
      handlers.resolve(event.data);
    };

    this.#worker.onerror = (event: ErrorEvent): void => {
      handlers.reject(event.message === '' ? 'PSD worker failed.' : event.message);
    };

    const copy = Uint8Array.from(input.bytes);

    this.#worker.postMessage({ bytes: copy, maxResultBytes: input.maxResultBytes }, [copy.buffer]);
  }

  terminate(): void {
    this.#worker.onmessage = null;
    this.#worker.onerror = null;
    this.#worker.terminate();
  }
}
