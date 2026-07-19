import { parsePsdBytesV1, type PsdParseResultV1 } from './import-parse';

export class TestPsdImportWorkerV1 {
  onmessage: ((event: MessageEvent<PsdParseResultV1>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(input: { readonly bytes: Uint8Array; readonly maxResultBytes: number }): void {
    this.onmessage?.(new MessageEvent('message', { data: parsePsdBytesV1(input.bytes) }));
  }

  terminate(): void {
    this.onmessage = null;
    this.onerror = null;
  }
}
