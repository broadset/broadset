import { type PdfParseResultV1 } from './parse';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface PdfIsolationWorkerHandlersV1 {
  readonly resolve: (result: PdfParseResultV1) => void;
  readonly reject: (message: string) => void;
}

export interface PdfIsolationWorkerV1 {
  parse(bytes: Uint8Array, handlers: PdfIsolationWorkerHandlersV1): void;
  terminate(): void;
}

type PdfIsolationResultV1 =
  | PdfParseResultV1
  | { readonly kind: 'isolation-failed'; readonly message: string }
  | { readonly kind: 'timeout' };

export async function parsePdfInIsolationV1(input: {
  readonly bytes: Uint8Array;
  readonly createWorker?: () => PdfIsolationWorkerV1;
  readonly timeoutMs?: number;
}): Promise<PdfIsolationResultV1> {
  const owned = createOwnedWorker(input.createWorker);

  if (owned.kind === 'unavailable') return { kind: 'isolation-failed', message: 'PDF worker is unavailable.' };
  if (owned.kind === 'failed') return { kind: 'isolation-failed', message: owned.message };

  const worker = owned.worker;

  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = validTimeout(input.timeoutMs);
    const timer = globalThis.setTimeout((): void => {
      finish({ kind: 'timeout' });
    }, timeoutMs);

    const finish = (result: PdfIsolationResultV1): void => {
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
      worker.parse(input.bytes, {
        resolve: finish,
        reject: (message: string): void => {
          finish({ kind: 'isolation-failed', message });
        },
      });
    } catch (error: unknown) {
      finish({
        kind: 'isolation-failed',
        message: error instanceof Error ? error.message : 'PDF worker failed to start.',
      });
    }
  });
}

type OwnedPdfWorker =
  | { readonly kind: 'worker'; readonly worker: PdfIsolationWorkerV1 }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

function createOwnedWorker(factory: (() => PdfIsolationWorkerV1) | undefined): OwnedPdfWorker {
  if (factory !== undefined) {
    try {
      return { kind: 'worker', worker: factory() };
    } catch (error: unknown) {
      return {
        kind: 'failed',
        message: error instanceof Error ? error.message : 'PDF worker failed to start.',
      };
    }
  }

  if (typeof Worker === 'undefined') return { kind: 'unavailable' };

  try {
    return { kind: 'worker', worker: new BrowserPdfIsolationWorker() };
  } catch (error: unknown) {
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : 'PDF worker failed to start.',
    };
  }
}

function validTimeout(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

class BrowserPdfIsolationWorker implements PdfIsolationWorkerV1 {
  readonly #worker: Worker;

  constructor() {
    this.#worker = new Worker(new URL('./worker-runtime.ts', import.meta.url), {
      type: 'module',
      name: 'broadset-pdf-import',
    });
  }

  parse(bytes: Uint8Array, handlers: PdfIsolationWorkerHandlersV1): void {
    this.#worker.onmessage = (event: MessageEvent<PdfParseResultV1>): void => {
      handlers.resolve(event.data);
    };

    this.#worker.onerror = (event: ErrorEvent): void => {
      handlers.reject(event.message === '' ? 'PDF worker failed.' : event.message);
    };

    const copy = Uint8Array.from(bytes);

    this.#worker.postMessage(copy, [copy.buffer]);
  }

  terminate(): void {
    this.#worker.onmessage = null;
    this.#worker.onerror = null;
    this.#worker.terminate();
  }
}
