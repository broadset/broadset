import { readdirSync,readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { importSvgProjectV1 } from './import';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const fixtureNames = readdirSync(fixtureDirectory).filter((fileName) => fileName.endsWith('.svg'));
const importedAt = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');

describe('v1 SVG real-world fixture validity', () => {
  it.each(fixtureNames)('%s imports with zero structural and semantic errors', async (fileName) => {
    const svg = readFileSync(join(fixtureDirectory, fileName), 'utf8');
    const result = await importSvgProjectV1({ svg, fileName, importedAt });
    const structural = projectFormatV1.parseProjectV1Unknown(result.project).diagnostics;

    expect(structural.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
  });
});
