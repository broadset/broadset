import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { importPdfProjectV1 } from '../pdf/v1';
import { importPptxProjectV1 } from '../pptx/v1';
import { importPsdProjectV1 } from '../psd/v1';
import { importSvgProjectV1 } from '../svg/v1';
import type { ProjectImportResultV1 } from './import-result';

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-15T00:00:00Z');

interface ImportOracleCase {
  readonly name: string;
  readonly run: () => Promise<ProjectImportResultV1>;
}

const cases: readonly ImportOracleCase[] = [
  {
    name: 'PDF',
    run: () => importPdfProjectV1({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), importedAt: IMPORTED_AT }),
  },
  {
    name: 'PSD',
    run: () => importPsdProjectV1({ bytes: new Uint8Array([0x38, 0x42, 0x50, 0x53]), importedAt: IMPORTED_AT }),
  },
  {
    name: 'SVG',
    run: () => importSvgProjectV1({ svg: '<svg><', importedAt: IMPORTED_AT }),
  },
  {
    name: 'PPTX',
    run: () => importPptxProjectV1({ bytes: new Uint8Array([0x50, 0x4b]), importedAt: IMPORTED_AT }),
  },
];

describe('public v1 importer trust-boundary oracle', () => {
  it.each(cases)('$name resolves malformed input to a structurally and semantically valid project', async ({ run }) => {
    const result = await run();

    expect(projectFormatV1.broadsetProjectV1Schema.safeParse(result.project).success).toBe(true);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings).length).toBeGreaterThan(0);
  });
});
