import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createParentingTransformTestProjectV1 } from './fixture-parenting-v1';

describe('createParentingTransformTestProjectV1', () => {
  it('creates a structurally and semantically valid v1 project fixture', () => {
    const project = createParentingTransformTestProjectV1();
    const parsed = projectFormatV1.parseProjectV1Unknown(project);

    expect(parsed.diagnostics.filter((diagnostic) => diagnostic.code === 'structural-invalid')).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);
  });
});
