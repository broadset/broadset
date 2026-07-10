import { z } from 'zod';

import type { Id } from './identity';

export const nonEmptyStringSchema = z.string().min(1);
export const positiveSafeIntegerSchema = z.number().int().positive();
export const nonNegativeSafeIntegerSchema = z.number().int().nonnegative();
export const finiteNumberSchema = z.number();
export const packagePathSchema = z.string().regex(/^blobs\/sha256\/[0-9a-f]{64}$/u);
export const mediaTypeSchema = z.string().regex(/^[^\s/]+\/[^\s/]+$/u);
export const axisTagSchema = z.string().regex(/^[ -~]{4}$/u);

export function validateUniqueIds(items: readonly { readonly id: Id }[], context: z.RefinementCtx): void {
  const seen = new Set<Id>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate local ID: ${item.id}`, path: [index, 'id'] });
    }

    seen.add(item.id);
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
