import { exportBspPackageV1, loadBspPackageV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { DEMO_DOCUMENT_V1, SAMPLE_PROJECT_BLOBS_V1, SAMPLE_PROJECT_V1 } from './sample-project-v1';

describe('demo sample project', () => {
  it('is structurally and semantically valid v1 while preserving selector ids', () => {
    const parsed = projectFormatV1.parseProjectV1Unknown(SAMPLE_PROJECT_V1);

    expect(parsed.diagnostics.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(SAMPLE_PROJECT_V1)).toEqual([]);
    expect(DEMO_DOCUMENT_V1.elements.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['el-scorebug', 'el-live-dot', 'el-l3-bg', 'el-stats-bg', 'el-replay-window']),
    );
    expect(DEMO_DOCUMENT_V1.sequences).toHaveLength(17);
    expect(DEMO_DOCUMENT_V1.viewModels[0]?.fields).toHaveLength(13);
    expect(DEMO_DOCUMENT_V1.bindings).toHaveLength(10);
  });

  it('round-trips as a self-contained native BSP package', async () => {
    const exported = await exportBspPackageV1({ project: SAMPLE_PROJECT_V1, blobs: SAMPLE_PROJECT_BLOBS_V1 });

    expect(exported.status).toBe('exported');
    if (exported.status !== 'exported') return;

    const loaded = await loadBspPackageV1(exported.bytes);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.blobs).toEqual(SAMPLE_PROJECT_BLOBS_V1);
  });
});
