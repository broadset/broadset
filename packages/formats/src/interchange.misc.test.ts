import type { BroadsetProject } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { exportProjectJson, generateQrSvgFragment, sanitizeFilename } from './interchange';
import { makeProject } from './interchange-test-helpers';

describe('QR SVG Fragment Generation', () => {
  /** @description Validates that empty content returns null. */
  it('returns null for empty content', () => {
    expect(generateQrSvgFragment('')).toBeNull();
  });

  /** @description Validates that valid content produces an SVG fragment with expected structure. */
  it('produces SVG with dark modules and white background for valid content', () => {
    const fragment = generateQrSvgFragment('https://example.com');

    expect(fragment).not.toBeNull();
    expect(fragment).toContain('<g fill="#000000">');
    expect(fragment).toContain('<rect');
  });
});

describe('Filename Sanitization', () => {
  /** @description Validates that illegal filesystem characters are stripped and spaces become hyphens. */
  it('strips illegal characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file-name');
  });

  /** @description Validates that whitespace-only input returns empty string. */
  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeFilename('   ')).toBe('');
  });

  /** @description Validates that consecutive hyphens are collapsed and leading/trailing trimmed. */
  it('collapses consecutive hyphens and trims edges', () => {
    expect(sanitizeFilename('--hello---world--')).toBe('hello-world');
  });
});

describe('Export Progress Reporting', () => {
  /** @description Validates that exports complete without error when no progress callback is provided. */
  it('completes without error when no onProgress is provided', () => {
    const project = makeProject();

    expect(() => exportProjectJson(project)).not.toThrow();
  });
});

describe('Export Error Handling', () => {
  /** @description Validates that JSON export wraps serialization errors in a descriptive Error. */
  it('rejects with descriptive error on serialization failure', () => {
    const circular = {} as Record<string, unknown>;

    circular['self'] = circular;

    expect(() => exportProjectJson(circular as unknown as BroadsetProject)).toThrow('JSON export failed:');
  });
});
