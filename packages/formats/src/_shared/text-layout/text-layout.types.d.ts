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

/**
 * Minimal `wawoff2` typing surface. Upstream ships no `.d.ts` and
 * no `@types/wawoff2` exists, so we declare just the export the
 * runtime decompressor uses. Declaring (rather than dynamic-import-as-
 * `unknown`) makes the dependency visible to `knip` so the
 * `no-cutting-corners` rule's dead-code gate runs without an ignore
 * exception.
 */
declare module 'wawoff2' {
  export function decompress(woff2: Uint8Array): Promise<Uint8Array>;
  export function compress(sfnt: Uint8Array): Promise<Uint8Array>;
}

/**
 * Minimal `jspdf` typing surface for cross-producer fixture tests.
 * Declared inline so the test suite can statically import the
 * constructor — making the dev-only dependency visible to `knip`
 * without leaking the full upstream typing surface.
 *
 * The exported binding is `jsPDF` (camelCase) to match upstream — we
 * re-export an interface + value alias so the lowercased name matches
 * the npm package's export without violating local class-naming
 * conventions.
 */
declare module 'jspdf' {
  interface JsPdfInstance {
    text(text: string, x: number, y: number): JsPdfInstance;
    addPage(options?: Record<string, unknown>): JsPdfInstance;
    setProperties(props: Record<string, string>): JsPdfInstance;
    addImage(
      data: string,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): JsPdfInstance;
    output(format: 'arraybuffer'): ArrayBuffer;
  }

  interface JsPdfConstructor {
    new (options?: Record<string, unknown>): JsPdfInstance;
  }

  export const jsPDF: JsPdfConstructor;
  export type jsPDF = JsPdfInstance;
}
