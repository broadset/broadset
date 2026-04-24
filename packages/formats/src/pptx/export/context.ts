import type { Canvas } from '@broadset/model';

import { RelationshipAllocator } from '../ooxml/relationships';

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
  /** Monotonic shape-id allocator for `<p:cNvPr id="…"/>`. Starts at 2 (OOXML reserves 1). */
  nextShapeId: number;
  /** Monotonic media counter so filenames stay unique within the slide. */
  nextMediaIndex: number;
}

export function createSlideContext(canvas: Canvas): SlideExportContext {
  return {
    canvas,
    rels: new RelationshipAllocator(),
    media: new Map<string, Uint8Array>(),
    nextShapeId: 2,
    nextMediaIndex: 1,
  };
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
