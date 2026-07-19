import { describe, expect, it } from 'vitest';

import { diagnosticSchema } from './index';

describe('v1 diagnostics', () => {
  it('accepts the exact diagnostic contract', () => {
    const diagnostic = {
      code: 'missing-resource',
      severity: 'error',
      message: 'The referenced asset is missing.',
      pointer: '/resources/assets/0',
      entity: { projectId: 'project', entityKind: 'asset', entityId: 'asset' },
      remediation: 'Relink the asset.',
    };

    expect(diagnosticSchema.parse(diagnostic)).toEqual(diagnostic);
  });

  it('rejects unknown fields and unsupported severity values', () => {
    expect(diagnosticSchema.safeParse({ code: 'x', severity: 'fatal', message: 'x' }).success).toBe(false);
    expect(diagnosticSchema.safeParse({ code: 'x', severity: 'warning', message: 'x', details: {} }).success).toBe(
      false,
    );
  });
});
