import { describe, expect, it } from 'vitest';

import * as formats from '../index';
import { BSP_JSON_MIME_V1, BSP_PROJECT_MIME_V1, exportBspPackageV1, loadBspPackageV1 } from '../index';

describe('v1 formats public API', () => {
  it('exports only the native BSP project boundary from the package root', () => {
    expect(BSP_PROJECT_MIME_V1).toBe('application/vnd.broadset.project');
    expect(BSP_JSON_MIME_V1).toBe('application/vnd.broadset.project+json');
    expect(typeof exportBspPackageV1).toBe('function');
    expect(typeof loadBspPackageV1).toBe('function');
    expect(Object.keys(formats).sort((left, right) => left.localeCompare(right))).toEqual([
      'BSP_JSON_MIME_V1',
      'BSP_PACKAGE_LIMITS_V1',
      'BSP_PROJECT_MIME_V1',
      'exportBspPackageV1',
      'loadBspPackageV1',
    ]);
  });

  it('does not expose the retired unversioned project-format API', () => {
    expect('exportPptxBytes' in formats).toBe(false);
    expect('exportProjectJson' in formats).toBe(false);
    expect('importSvgDocument' in formats).toBe(false);
    expect('reconcilePptx' in formats).toBe(false);
    expect('exportPdfBytesV1' in formats).toBe(false);
    expect('exportPptxBytesV1' in formats).toBe(false);
    expect('exportPsdBytesV1' in formats).toBe(false);
    expect('exportSvgStringV1' in formats).toBe(false);
    expect('exportVideoBlob' in formats).toBe(false);
    expect('importPdfProjectV1' in formats).toBe(false);
    expect('importPptxProjectV1' in formats).toBe(false);
    expect('importPsdProjectV1' in formats).toBe(false);
    expect('importSvgProjectV1' in formats).toBe(false);
  });
});
