/**
 * Importer-internal shared types and helpers extracted from
 * `import.ts` so sibling modules (`import-text.ts`, future
 * `import-shapes.ts`) can declare their parameter shapes without
 * pulling the whole orchestrator file. Split out in P7.7m to keep
 * the orchestrator under the soft size limit.
 */
import svgpath from 'svgpath';
import { type Matrix } from 'transformation-matrix';

import type { SvgSourceStyle, SvgSourceTextBody } from './source-model';
import { type DecomposedTransform } from './transform';

export interface SvgFontSource {
  readonly bytes?: Uint8Array | undefined;
  readonly url?: string | undefined;
  readonly format: 'woff2' | 'ttf' | 'otf';
  readonly __testPermissionOverride?: 'installable' | 'editable' | 'preview-print' | 'restricted' | undefined;
}

export interface ImportedElement {
  readonly type: string;
  /**
   * Text-element content can be either a plain `string` (single
   * `<text>` body, no `<tspan>`s) or a structured source text body
   * carrying paragraphs / runs with per-run style overrides
   * (built from `<tspan>` children). Other element kinds
   * (`path`, `image`, etc.) always carry a string.
   */
  readonly content: string | SvgSourceTextBody;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: SvgSourceStyle;
  readonly dataBsId?: string | undefined;
  readonly dataBsKind?: string | undefined;
  readonly parentDataBsId?: string | null | undefined;
  readonly textPathElementId?: string | undefined;
  readonly preservedOuterHTML?: string | undefined;
}

export interface TransformState {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  /**
   * Cumulative matrix from root to this element. Always populated;
   * defaults to identity. When `requiresBake` is `true` the leaf
   * shape importer pre-multiplies its geometry by this matrix
   * instead of using `x`/`y`/`rotation` (which are unreliable
   * once a bake-requiring ancestor is in the chain).
   */
  readonly matrix: Matrix;
  /**
   * `true` when the cumulative matrix carries a non-trivial scale
   * or skew that Broadset cannot represent natively (per IO-D-02).
   * Drives leaf shapes to bake geometry into a `<path>` rather than
   * keeping a native `rectangle` / `ellipse` / etc.
   */
  readonly requiresBake: boolean;
}

export interface ShapeBakeContext {
  readonly transform: TransformState;
  readonly baseStyle: SvgSourceStyle;
  readonly tagMeta: Readonly<{
    readonly dataBsId?: string;
    readonly dataBsKind?: string;
    readonly parentDataBsId: string | null;
  }>;
}

/**
 * Pre-multiply a path `d` string by a 2D affine matrix using
 * `svgpath`. Used when a non-decomposable transform (scale / skew
 * / matrix with non-identity 2x2) is applied to a shape — Broadset
 * has no native scale/skew element fields per IO-D-02, so the
 * geometry is pre-multiplied and stored as a `path`.
 */
export function bakePathWithMatrix(d: string, matrix: DecomposedTransform['matrix']): string {
  if (d === '') return '';

  return svgpath(d).matrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]).abs().round(3).toString();
}
