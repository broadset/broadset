import { readPsd } from 'ag-psd';

import { ensureCanvasInitialized } from './runtime-canvas';

export type ParsedPsdV1 = ReturnType<typeof readPsd>;

export type PsdParseResultV1 =
  | { readonly kind: 'ok'; readonly psd: ParsedPsdV1 }
  | { readonly kind: 'malformed'; readonly message: string };

export function parsePsdBytesV1(bytes: Uint8Array): PsdParseResultV1 {
  try {
    ensureCanvasInitialized();

    const copy = Uint8Array.from(bytes);
    const psd = readPsd(copy.buffer, {
      skipCompositeImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
      useImageData: true,
    });

    return { kind: 'ok', psd };
  } catch (error: unknown) {
    return {
      kind: 'malformed',
      message: error instanceof Error ? error.message : 'PSD import could not parse the malformed byte stream.',
    };
  }
}
