import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import sampleFixture from './sampleDocument.v1.json' with { type: 'json' };
import {
  buildLayerInfoListV1,
  resolveProjectAssetUrlV1,
  selectDocumentV1,
  selectPageV1,
} from './v1-demo-project';

const project = projectFormatV1.broadsetProjectV1Schema.parse(sampleFixture.sampleProject);
const documentId = projectFormatV1.idSchema.parse('doc-broadcast-main');
const pageId = projectFormatV1.idSchema.parse('page-match-live');

describe('v1 demo project selectors', () => {
  it('selects documents and pages by stable identity', () => {
    expect(selectDocumentV1(project, documentId)?.name).toBe('Premier League Live — Full HD');
    expect(selectPageV1(project, documentId, pageId)?.name).toBe('Match — Live');
  });

  it('builds the visible page layer hierarchy from v1 root instances', () => {
    const layers = buildLayerInfoListV1({ project, documentId, pageId });
    const scorebug = layers.find(({ id }) => id === 'el-scorebug');
    const score = layers.find(({ id }) => id === 'el-sb-home-score');

    expect(scorebug).toMatchObject({ depth: 0, hasChildren: true, visible: true });
    expect(score).toMatchObject({ depth: 1, parentName: 'Score Bug', visible: true });
  });

  it('exposes only browser-safe external asset URLs', () => {
    expect(resolveProjectAssetUrlV1(project, projectFormatV1.idSchema.parse('asset-home-crest'))).toBe(
      'https://picsum.photos/id/102/150/150',
    );
    expect(resolveProjectAssetUrlV1(project, projectFormatV1.idSchema.parse('asset-replay-clip'))).toBeNull();
  });
});
