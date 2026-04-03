import { z } from 'zod';

import type { AnimationRegistryEntry } from './animation';
import { animationRegistrySchema } from './animation';

// ---------------------------------------------------------------------------
// Canvas schema
// ---------------------------------------------------------------------------

const paddingTupleSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
]);

const canvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  padding: paddingTupleSchema,
});

export interface Canvas {
  readonly width: number;
  readonly height: number;
  readonly padding: readonly [number, number, number, number];
}

// ---------------------------------------------------------------------------
// Page / element schemas (lightweight — full element validation is in element.ts)
// ---------------------------------------------------------------------------

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const pageElementSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: positionSchema,
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  content: z.string(),
  parentId: z.string().nullable(),
  groupId: z.string().nullable(),
  screen: z.record(z.string(), z.unknown()).optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

const pageSchema = z
  .object({
    id: z.string().min(1),
    elements: z.array(pageElementSchema),
  })
  .refine(
    (page) => {
      const ids = new Set<string>();

      for (const el of page.elements) {
        if (ids.has(el.id)) {
          return false;
        }

        ids.add(el.id);
      }

      return true;
    },
    { message: 'Duplicate element IDs within a page' },
  )
  .refine(
    (page) => {
      const idSet = new Set(page.elements.map((el) => el.id));

      for (const el of page.elements) {
        if (el.parentId !== null && !idSet.has(el.parentId)) {
          return false;
        }
      }

      return true;
    },
    { message: 'parentId references an element not on this page' },
  )
  .refine(
    (page) => {
      const parentMap = new Map<string, string | null>();

      for (const el of page.elements) {
        parentMap.set(el.id, el.parentId);
      }

      for (const el of page.elements) {
        const visited = new Set<string>();
        let current: string | null = el.id;

        while (current !== null) {
          if (visited.has(current)) {
            return false;
          }

          visited.add(current);
          current = parentMap.get(current) ?? null;
        }
      }

      return true;
    },
    { message: 'Circular parentId references detected' },
  );

// ---------------------------------------------------------------------------
// Page interface
// ---------------------------------------------------------------------------

export interface Page {
  readonly id: string;
  readonly elements: readonly PageElement[];
}

export interface PageElement {
  readonly id: string;
  readonly type: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string;
  readonly parentId: string | null;
  readonly groupId: string | null;
}

// ---------------------------------------------------------------------------
// BroadsetDocument
// ---------------------------------------------------------------------------

export interface BroadsetDocument {
  readonly id: string;
  readonly documentMode: 'screen' | 'print';
  readonly canvas: Canvas;
  readonly pages: readonly Page[];
  readonly animationRegistry: readonly AnimationRegistryEntry[];
}

export const broadsetDocumentSchema = z.object({
  id: z.string().min(1),
  documentMode: z.enum(['screen', 'print']),
  canvas: canvasSchema,
  pages: z.array(pageSchema).min(1),
  animationRegistry: animationRegistrySchema,
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let counter = 0;

function generateId(): string {
  counter += 1;

  return `doc-${String(Date.now())}-${String(counter)}`;
}

export function createEmptyBroadsetDocument(): BroadsetDocument {
  return {
    id: generateId(),
    documentMode: 'screen',
    canvas: {
      width: 508,
      height: 285.75,
      padding: [0, 0, 0, 0],
    },
    pages: [
      {
        id: 'page-1',
        elements: [],
      },
    ],
    animationRegistry: [],
  };
}
