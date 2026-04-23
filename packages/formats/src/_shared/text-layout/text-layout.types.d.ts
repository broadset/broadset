declare module 'linebreak' {
  interface LinebreakResult {
    readonly position: number;
    readonly required: boolean;
  }

  class LineBreaker {
    constructor(input: string);
    nextBreak(): LinebreakResult | null;
  }

  export default LineBreaker;
}

declare module 'bidi-js' {
  interface BidiEmbeddingLevels {
    readonly paragraphs: ReadonlyArray<{
      readonly start: number;
      readonly end: number;
      readonly level: number;
    }>;
    readonly levels: Uint8Array;
  }

  interface BidiApi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl'): BidiEmbeddingLevels;
  }

  function bidiFactory(): BidiApi;

  export default bidiFactory;
}
