import { z } from 'zod';

import { broadsetDocumentSchema } from './document';

export interface CanvasSizePreset {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const COMMON_CANVAS_SIZES: readonly CanvasSizePreset[] = [
  { label: 'Full HD (1920×1080)', width: 1920, height: 1080 },
  { label: '4K UHD (3840×2160)', width: 3840, height: 2160 },
  { label: '720p (1280×720)', width: 1280, height: 720 },
  { label: 'A4 Portrait', width: 210, height: 297 },
  { label: 'A4 Landscape', width: 297, height: 210 },
  { label: 'US Letter', width: 8.5, height: 11 },
  { label: 'Instagram Post (1080×1080)', width: 1080, height: 1080 },
];

const fontVariantSchema = z.object({
  weight: z.union([
    z.literal(100),
    z.literal(200),
    z.literal(300),
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
    z.literal(800),
    z.literal(900),
  ]),
  style: z.enum(['normal', 'italic']),
});

const fontSourceSchema = z.union([
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('url'), url: z.string().min(1) }),
  z.object({ kind: z.literal('assetId'), assetId: z.string().min(1) }),
]);

const projectSettingsSchema = z.object({
  fonts: z
    .array(
      z.object({
        family: z.string().min(1),
        variants: z.array(fontVariantSchema).optional(),
        source: fontSourceSchema.optional(),
      }),
    )
    .default([]),
  palette: z.array(z.string()).default([]),
  defaultDocumentMode: z.enum(['screen', 'print']).default('screen'),
});

const assetSourceSchema = z.union([
  z.object({ type: z.literal('url'), url: z.string().min(1) }),
  z.object({ type: z.literal('embedded'), dataUri: z.string().min(1) }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
]);

const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['image', 'video', 'font', 'audio', 'data']),
  mimeType: z.string().min(1),
  source: assetSourceSchema,
  fileSizeBytes: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const templateGroupSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1),
  members: z
    .array(
      z.object({
        documentId: z.string().min(1),
        role: z.enum(['16:9', '9:16', '1:1', '4:3', 'custom']),
        label: z.string().optional(),
      }),
    )
    .min(1),
});

export const fullDocumentSchema = broadsetDocumentSchema;

export const broadsetProjectSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  settings: projectSettingsSchema,
  assets: z.array(assetSchema),
  documents: z.array(broadsetDocumentSchema).min(1),
  templateGroups: z.array(templateGroupSchema).optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export type FullBroadsetDocument = z.infer<typeof fullDocumentSchema>;
export type BroadsetProject = z.infer<typeof broadsetProjectSchema>;
