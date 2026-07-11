import { z } from 'zod';

import type { Id } from './identity';

interface UniqueValueValidationOptions {
  readonly items: readonly Id[];
  readonly context: z.RefinementCtx;
  readonly path: readonly (string | number)[];
}

export const nonEmptyStringSchema = z.string().min(1);
export const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const nonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const finiteNumberSchema = z.number();
export const packagePathSchema = z.string().regex(/^blobs\/sha256\/[0-9a-f]{64}$/u);
export const mediaTypeSchema = z.string().regex(/^[^\s/]+\/[^\s/]+$/u);
export const axisTagSchema = z.string().regex(/^[ -~]{4}$/u);

export const absoluteUriSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/u);
export const absoluteHttpsUrlSchema = z
  .string()
  .regex(/^[Hh][Tt][Tt][Pp][Ss]:\/\/[^/?#\s]+(?:[/?#][^\s]*)?$/u, 'Expected an absolute HTTPS URL shape');

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
