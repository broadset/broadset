import { describe, expect, it } from 'vitest';

import {
  assembleImportedProjectV1,
  computeSha256DigestV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  packageBlobReferenceV1,
} from '../index';

describe('v1 formats public API', () => {
  it('exports the import foundation from the package root', () => {
    expect(typeof computeSha256DigestV1).toBe('function');
    expect(typeof packageBlobReferenceV1).toBe('function');
    expect(typeof createResourceCollectorV1).toBe('function');
    expect(typeof createInteropCollectorV1).toBe('function');
    expect(typeof assembleImportedProjectV1).toBe('function');
  });
});
