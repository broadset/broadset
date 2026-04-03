import { z } from 'zod';

import { animationRegistrySchema } from './animation';
import { screenPropsSchema } from './screen';
import { styleSchema } from './style';

// ---------------------------------------------------------------------------
// Common canvas sizes (mm)
// ---------------------------------------------------------------------------

export interface CanvasSizePreset {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const COMMON_CANVAS_SIZES: readonly CanvasSizePreset[] = [
  { label: 'Full HD (1920×1080)', width: 508, height: 285.75 },
  { label: '4K UHD (3840×2160)', width: 1016, height: 571.5 },
  { label: 'A4 Portrait', width: 210, height: 297 },
  { label: 'A4 Landscape', width: 297, height: 210 },
  { label: '720p (1280×720)', width: 338.67, height: 190.5 },
  { label: 'Instagram Post (1080×1080)', width: 287.87, height: 287.87 },
];

// ---------------------------------------------------------------------------
// Full element schema — composes style + screen sub-schemas
// ---------------------------------------------------------------------------

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const fullElementSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: positionSchema,
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  content: z.string(),
  style: styleSchema,
  screen: screenPropsSchema,
  parentId: z.string().nullable(),
  groupId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Page schema with integrity refinements
// ---------------------------------------------------------------------------

const fullPageSchema = z
  .object({
    id: z.string().min(1),
    elements: z.array(fullElementSchema),
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
// Canvas schema
// ---------------------------------------------------------------------------

const canvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  padding: z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
  ]),
  backgroundPdf: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Metadata schema
// ---------------------------------------------------------------------------

const metadataSchema = z.object({
  name: z.string().optional(),
  createdAtIso: z.string().optional(),
  updatedAtIso: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Full document schema
// ---------------------------------------------------------------------------

export const fullDocumentSchema = z.object({
  id: z.string().min(1),
  documentMode: z.enum(['screen', 'print']),
  canvas: canvasSchema,
  pages: z.array(fullPageSchema).min(1),
  animationRegistry: animationRegistrySchema,
  metadata: metadataSchema.optional(),
});

export type FullBroadsetDocument = z.infer<typeof fullDocumentSchema>;
