import { z } from 'zod';

import type { Id } from './identity';

interface UniqueIdValidationOptions {
  readonly items: readonly { readonly id: Id }[];
  readonly context: z.RefinementCtx;
  readonly path: readonly (string | number)[];
}

interface UniqueValueValidationOptions {
  readonly items: readonly Id[];
  readonly context: z.RefinementCtx;
  readonly path: readonly (string | number)[];
}

export const nonEmptyStringSchema = z.string().min(1);
export const positiveSafeIntegerSchema = z.number().int().positive();
export const nonNegativeSafeIntegerSchema = z.number().int().nonnegative();
export const finiteNumberSchema = z.number();
export const packagePathSchema = z.string().regex(/^blobs\/sha256\/[0-9a-f]{64}$/u);
export const mediaTypeSchema = z.string().regex(/^[^\s/]+\/[^\s/]+$/u);
export const axisTagSchema = z.string().regex(/^[ -~]{4}$/u);

export function hasHttpsScheme(url: string): boolean {
  const schemeSeparatorIndex = url.indexOf(':');

  return schemeSeparatorIndex > 0 && url.slice(0, schemeSeparatorIndex).toLowerCase() === 'https';
}

export const absoluteHttpsUrlSchema = z.url().refine(hasHttpsScheme, 'Expected an absolute HTTPS URL');

export function validateUniqueIds({ items, context, path }: UniqueIdValidationOptions): void {
  const seen = new Set<Id>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate local ID: ${item.id}`, path: [...path, index, 'id'] });
    }

    seen.add(item.id);
  });
}

export function validateUniqueValues({ items, context, path }: UniqueValueValidationOptions): void {
  const seen = new Set<Id>();

  items.forEach((item, index) => {
    if (seen.has(item)) {
      context.addIssue({ code: 'custom', message: `Duplicate local ID: ${item}`, path: [...path, index] });
    }

    seen.add(item);
  });
}

export function greatestCommonDivisor(first: number, second: number): number {
  let left = first;
  let right = second;

  while (right !== 0) {
    const remainder = left % right;

    left = right;
    right = remainder;
  }

  return left;
}
