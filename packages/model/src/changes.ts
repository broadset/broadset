import { z } from 'zod';

// ---------------------------------------------------------------------------
// Change type vocabulary
// ---------------------------------------------------------------------------

export const CHANGE_TYPES = [
  'element:add',
  'element:remove',
  'element:update',
  'element:reorder',
  'animation:update',
  'page:add',
  'page:remove',
  'settings:update',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

// ---------------------------------------------------------------------------
// Per-variant interfaces
// ---------------------------------------------------------------------------

export interface ElementAddChange {
  readonly type: 'element:add';
  readonly pageIndex: number;
  readonly elementId: string;
  readonly element: Record<string, unknown>;
}

export interface ElementRemoveChange {
  readonly type: 'element:remove';
  readonly pageIndex: number;
  readonly elementId: string;
  readonly element: Record<string, unknown>;
}

export interface ElementUpdateChange {
  readonly type: 'element:update';
  readonly pageIndex: number;
  readonly elementId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface ElementReorderChange {
  readonly type: 'element:reorder';
  readonly pageIndex: number;
  readonly elementId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface AnimationUpdateChange {
  readonly type: 'animation:update';
  readonly elementId: string;
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface PageAddChange {
  readonly type: 'page:add';
  readonly pageIndex: number;
}

export interface PageRemoveChange {
  readonly type: 'page:remove';
  readonly pageIndex: number;
}

export interface SettingsUpdateChange {
  readonly type: 'settings:update';
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
  | SettingsUpdateChange;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const elementAddSchema = z.object({
  type: z.literal('element:add'),
  pageIndex: z.number().int().nonnegative(),
  elementId: z.string().min(1),
  element: z.record(z.string(), z.unknown()),
});

const elementRemoveSchema = z.object({
  type: z.literal('element:remove'),
  pageIndex: z.number().int().nonnegative(),
  elementId: z.string().min(1),
  element: z.record(z.string(), z.unknown()),
});

const elementUpdateSchema = z.object({
  type: z.literal('element:update'),
  pageIndex: z.number().int().nonnegative(),
  elementId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const elementReorderSchema = z.object({
  type: z.literal('element:reorder'),
  pageIndex: z.number().int().nonnegative(),
  elementId: z.string().min(1),
  fromIndex: z.number().int().nonnegative(),
  toIndex: z.number().int().nonnegative(),
});

const animationUpdateSchema = z.object({
  type: z.literal('animation:update'),
  elementId: z.string().min(1),
  path: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

const pageAddSchema = z.object({
  type: z.literal('page:add'),
  pageIndex: z.number().int().nonnegative(),
});

const pageRemoveSchema = z.object({
  type: z.literal('page:remove'),
  pageIndex: z.number().int().nonnegative(),
});

const settingsUpdateSchema = z.object({
  type: z.literal('settings:update'),
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
  settingsUpdateSchema,
]);
