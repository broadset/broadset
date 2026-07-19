import { z } from 'zod';

import { type EntityAddress, entityAddressSchema } from './identity';

export interface Diagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly pointer?: string;
  readonly entity?: EntityAddress;
  readonly remediation?: string;
}

export const diagnosticSchema = z.strictObject({
  code: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1),
  pointer: z.string().optional(),
  entity: entityAddressSchema.optional(),
  remediation: z.string().min(1).optional(),
});
