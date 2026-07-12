import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { DEMO_DOCUMENT_V1, SAMPLE_PROJECT_V1 } from './sample-project-v1';

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
});
