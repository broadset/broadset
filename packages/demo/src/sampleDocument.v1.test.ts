import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import sampleFixture from './sampleDocument.v1.json' with { type: 'json' };

describe('demo sample project', () => {
  it('is structurally and semantically valid v1 while preserving selector ids', () => {
    const project = projectFormatV1.broadsetProjectV1Schema.parse(sampleFixture.sampleProject);
    const parsed = projectFormatV1.parseProjectV1Unknown(project);
    const document = project.documents[0];

    expect(parsed.diagnostics.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);
    expect(document?.elements.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['el-scorebug', 'el-live-dot', 'el-l3-bg', 'el-stats-bg', 'el-replay-window']),
    );
    expect(document?.sequences).toHaveLength(17);
    expect(document?.viewModels[0]?.fields).toHaveLength(13);
    expect(document?.bindings).toHaveLength(10);
  });
});

