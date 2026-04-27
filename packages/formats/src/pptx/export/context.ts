import type { Canvas } from '@broadset/model';

import { RelationshipAllocator } from '../ooxml/relationships';
import type { PptxExportWarning } from '../types';

/**
 * Per-slide export context. Tracks relationship allocation, media
 * payloads, and the canvas for EMU conversions. A fresh context is
 * created per slide so each slide's rel IDs allocate from `rId1`.
 */
export interface SlideExportContext {
  readonly canvas: Canvas;
  readonly rels: RelationshipAllocator;
  /** Per-slide media entries keyed by path inside the ZIP. */
  readonly media: Map<string, Uint8Array>;
  /**
   * Map from Broadset element id → the OOXML shape id allocated to that
   * shape within this slide. `<p:timing>` targets shapes by id via
   * `<p:spTgt spid="…"/>`; we populate the map during shape emission
   * and read it back when emitting timing.
   */
  readonly shapeIdByElementId: Map<string, number>;
  /** Monotonic shape-id allocator for `<p:cNvPr id="…"/>`. Starts at 2 (OOXML reserves 1). */
  nextShapeId: number;
  /** Monotonic media counter so filenames stay unique within the slide. */
  nextMediaIndex: number;
  /**
   * Sink for fidelity-loss warnings emitted during slide emission
   * (silent drops in {@link emitEffects}, unsupported animation
   * presets, etc.). The package builder aggregates these per slide and
   * surfaces them through {@link exportPptxWithReport}.
   */
  readonly warnings: PptxExportWarning[];
}

export function createSlideContext(canvas: Canvas): SlideExportContext {
  return {
    canvas,
    rels: new RelationshipAllocator(),
    media: new Map<string, Uint8Array>(),
    shapeIdByElementId: new Map<string, number>(),
    nextShapeId: 2,
    nextMediaIndex: 1,
    warnings: [],
  };
}

/** Append a warning to the slide context's sink. */
export function pushExportWarning(ctx: SlideExportContext, warning: PptxExportWarning): void {
  ctx.warnings.push(warning);
}

export function allocateShapeId(ctx: SlideExportContext): number {
  const id = ctx.nextShapeId;

  ctx.nextShapeId += 1;

  return id;
}

export function allocateMediaIndex(ctx: SlideExportContext): number {
  const index = ctx.nextMediaIndex;

  ctx.nextMediaIndex += 1;

  return index;
}
