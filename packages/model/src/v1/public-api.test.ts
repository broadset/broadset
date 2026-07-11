import { describe, expect, it } from 'vitest';

import {
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
  loadProjectV1Json,
  parseProjectV1Unknown,
  projectFormatV1,
} from '../index';

describe('v1 package public API', () => {
  it('exports loading and canonical JSON APIs from the package root', () => {
    expect(canonicalizeProjectV1).toBe(projectFormatV1.canonicalizeProjectV1);
    expect(computeProjectSemanticHashV1).toBe(projectFormatV1.computeProjectSemanticHashV1);
    expect(loadProjectV1Json).toBe(projectFormatV1.loadProjectV1Json);
    expect(parseProjectV1Unknown).toBe(projectFormatV1.parseProjectV1Unknown);
  });
});
