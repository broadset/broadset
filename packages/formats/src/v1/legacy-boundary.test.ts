import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const formatsSourceDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const nativeV1Directories = ['pdf/v1', 'pptx/v1', 'psd/v1', 'svg/v1'];
const forbiddenLegacyPatterns: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'legacy adapter filename', pattern: /to-legacy/iu },
  {
    label: 'legacy model symbol',
    pattern:
      /(?<!\.)\b(?:BroadsetDocument|BroadsetElement|BroadsetElementStyle|BroadsetElementStyleInput|BroadsetColor|BroadsetGradient|TextBody|FontAsset|createEmptyBroadsetDocument|createDefaultElement|fontAsset|iccProfileAsset|isTextBody)\b/u,
  },
];

function productionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (extname(entry.name) !== '.ts' || entry.name.endsWith('.test.ts')) return [];

    return [path];
  });
}

describe('native v1 format boundary', () => {
  it('contains no legacy project-model adapters or bare legacy symbols', () => {
    const findings = nativeV1Directories.flatMap((relativeDirectory) =>
      productionTypeScriptFiles(join(formatsSourceDirectory, relativeDirectory)).flatMap((path) => {
        const source = readFileSync(path, 'utf8');

        return forbiddenLegacyPatterns
          .filter(({ pattern }) => pattern.test(path) || pattern.test(source))
          .map(({ label }) => `${relativeDirectory}: ${label} in ${path}`);
      }),
    );

    expect(findings).toEqual([]);
  });

  it('keeps the native PDF exporter independent of the retired writer', () => {
    const findings = productionTypeScriptFiles(join(formatsSourceDirectory, 'pdf/v1')).filter((path) =>
      /from ['"]\.\.\/(?:core|project-document|project-model)['"]/u.test(readFileSync(path, 'utf8')),
    );

    expect(findings).toEqual([]);
  });
});
