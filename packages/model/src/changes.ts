import { z } from 'zod';

export const CHANGE_TYPES = [
  'element:add',
  'element:remove',
  'element:update',
  'element:reorder',
  'animation:update',
  'page:add',
  'page:remove',
  'page:override:update',
  'settings:update',
  'dataSchema:update',
  'asset:add',
  'asset:remove',
  'asset:update',
  'project:settings:update',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface ElementAddChange {
  readonly type: 'element:add';
  readonly documentId: string;
  readonly elementId: string;
  readonly element: UnknownRecord;
}

export interface ElementRemoveChange {
  readonly type: 'element:remove';
  readonly documentId: string;
  readonly elementId: string;
  readonly element: UnknownRecord;
}

export interface ElementUpdateChange {
  readonly type: 'element:update';
  readonly documentId: string;
  readonly elementId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface ElementReorderChange {
  readonly type: 'element:reorder';
  readonly documentId: string;
  readonly elementId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface AnimationUpdateChange {
  readonly type: 'animation:update';
  readonly documentId: string;
  readonly elementId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface PageAddChange {
  readonly type: 'page:add';
  readonly documentId: string;
  readonly pageId: string;
  readonly page: UnknownRecord;
}

export interface PageRemoveChange {
  readonly type: 'page:remove';
  readonly documentId: string;
  readonly pageId: string;
  readonly page: UnknownRecord;
}

export interface PageOverrideUpdateChange {
  readonly type: 'page:override:update';
  readonly documentId: string;
  readonly pageId: string;
  readonly elementId: string;
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface SettingsUpdateChange {
  readonly type: 'settings:update';
  readonly documentId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface DataSchemaUpdateChange {
  readonly type: 'dataSchema:update';
  readonly documentId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface AssetAddChange {
  readonly type: 'asset:add';
  readonly assetId: string;
  readonly asset: UnknownRecord;
}

export interface AssetRemoveChange {
  readonly type: 'asset:remove';
  readonly assetId: string;
  readonly asset: UnknownRecord;
}

export interface AssetUpdateChange {
  readonly type: 'asset:update';
  readonly assetId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface ProjectSettingsUpdateChange {
  readonly type: 'project:settings:update';
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export type DocumentChange =
  | ElementAddChange
  | ElementRemoveChange
  | ElementUpdateChange
  | ElementReorderChange
  | AnimationUpdateChange
  | PageAddChange
  | PageRemoveChange
  | PageOverrideUpdateChange
  | SettingsUpdateChange
  | DataSchemaUpdateChange
  | AssetAddChange
  | AssetRemoveChange
  | AssetUpdateChange
  | ProjectSettingsUpdateChange;

const elementAddSchema = z.object({
  type: z.literal('element:add'),
  documentId: z.string().min(1),
  elementId: z.string().min(1),
  element: z.record(z.string(), z.unknown()),
});

const elementRemoveSchema = z.object({
  type: z.literal('element:remove'),
  documentId: z.string().min(1),
  elementId: z.string().min(1),
  element: z.record(z.string(), z.unknown()),
});

const elementUpdateSchema = z.object({
  type: z.literal('element:update'),
  documentId: z.string().min(1),
  elementId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const elementReorderSchema = z.object({
  type: z.literal('element:reorder'),
  documentId: z.string().min(1),
  elementId: z.string().min(1),
  fromIndex: z.number().int().nonnegative(),
  toIndex: z.number().int().nonnegative(),
});

const animationUpdateSchema = z.object({
  type: z.literal('animation:update'),
  documentId: z.string().min(1),
  elementId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const pageAddSchema = z.object({
  type: z.literal('page:add'),
  documentId: z.string().min(1),
  pageId: z.string().min(1),
  page: z.record(z.string(), z.unknown()),
});

const pageRemoveSchema = z.object({
  type: z.literal('page:remove'),
  documentId: z.string().min(1),
  pageId: z.string().min(1),
  page: z.record(z.string(), z.unknown()),
});

const pageOverrideUpdateSchema = z.object({
  type: z.literal('page:override:update'),
  documentId: z.string().min(1),
  pageId: z.string().min(1),
  elementId: z.string().min(1),
  field: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const settingsUpdateSchema = z.object({
  type: z.literal('settings:update'),
  documentId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const dataSchemaUpdateSchema = z.object({
  type: z.literal('dataSchema:update'),
  documentId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const assetAddSchema = z.object({
  type: z.literal('asset:add'),
  assetId: z.string().min(1),
  asset: z.record(z.string(), z.unknown()),
});

const assetRemoveSchema = z.object({
  type: z.literal('asset:remove'),
  assetId: z.string().min(1),
  asset: z.record(z.string(), z.unknown()),
});

const assetUpdateSchema = z.object({
  type: z.literal('asset:update'),
  assetId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const projectSettingsUpdateSchema = z.object({
  type: z.literal('project:settings:update'),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

export const changeSchema = z.discriminatedUnion('type', [
  elementAddSchema,
  elementRemoveSchema,
  elementUpdateSchema,
  elementReorderSchema,
  animationUpdateSchema,
  pageAddSchema,
  pageRemoveSchema,
  pageOverrideUpdateSchema,
  settingsUpdateSchema,
  dataSchemaUpdateSchema,
  assetAddSchema,
  assetRemoveSchema,
  assetUpdateSchema,
  projectSettingsUpdateSchema,
]);
