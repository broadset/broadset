import { parsePdfBytesV1, type PdfParseResultV1 } from './parse';

export class TestPdfImportWorkerV1 {
  onmessage: ((event: MessageEvent<PdfParseResultV1>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(bytes: Uint8Array): void {
    void parsePdfBytesV1(bytes).then((result): void => {
      this.onmessage?.(new MessageEvent('message', { data: result }));
    });
  }

  terminate(): void {
    this.onmessage = null;
    this.onerror = null;
  }
}
