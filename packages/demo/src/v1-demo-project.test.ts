import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from './sample-project-v1';
import {
  buildLayerInfoListV1,
  buildMediaAssetsV1,
  parseLayerInstanceIdV1,
  resolveProjectAssetUrlV1,
  selectDocumentV1,
  selectPageV1,
} from './v1-demo-project';

const project = SAMPLE_PROJECT_V1;
const documentId = projectFormatV1.idSchema.parse('doc-broadcast-main');
const pageId = projectFormatV1.idSchema.parse('page-match-live');
const SCOREBUG_ID = projectFormatV1.idSchema.parse('el-scorebug');
const HOME_SCORE_ID = projectFormatV1.idSchema.parse('el-sb-home-score');

describe('v1 demo project selectors', () => {
  it('selects documents and pages by stable identity', () => {
    expect(selectDocumentV1(project, documentId)?.name).toBe('Premier League Live — Full HD');
    expect(selectPageV1(project, documentId, pageId)?.name).toBe('Match — Live');
  });

  it('builds the visible page layer hierarchy from v1 root instances', () => {
    const layers = buildLayerInfoListV1({ project, documentId, pageId });
    const scorebug = layers.find(
      ({ id: layerId }) => parseLayerInstanceIdV1(layerId, pageId)?.elementId === SCOREBUG_ID,
    );
    const score = layers.find(
      ({ id: layerId }) => parseLayerInstanceIdV1(layerId, pageId)?.elementId === HOME_SCORE_ID,
    );

    expect(scorebug).toMatchObject({ depth: 0, hasChildren: true, visible: true });
    expect(score).toMatchObject({ depth: 1, parentName: 'Score Bug', visible: true });
  });

  it('gives repeated placements collision-free layer row identities', () => {
    const document = project.documents[0];
    const page = document?.pages[0];
    const firstRoot = page?.rootInstances[0];

    if (document === undefined || page === undefined || firstRoot === undefined) {
      throw new Error('Expected the v1 sample root placement');
    }

    const repeatedProject: projectFormatV1.BroadsetProjectV1 = {
      ...project,
      documents: [
        {
          ...document,
          pages: [
            {
              ...page,
              rootInstances: [firstRoot, { ...firstRoot, id: projectFormatV1.idSchema.parse('repeated-layer-root') }],
            },
            ...document.pages.slice(1),
          ],
        },
      ],
    };
    const layers = buildLayerInfoListV1({ project: repeatedProject, documentId, pageId });
    const repeatedName = document.elements.find(({ id: elementId }) => elementId === firstRoot.elementId)?.name;

    expect(new Set(layers.map(({ id: layerId }) => layerId)).size).toBe(layers.length);
    expect(layers.filter(({ name }) => name === repeatedName)).toHaveLength(2);
  });

  it('does not mistake native package references for browser URLs', () => {
    expect(resolveProjectAssetUrlV1(project, projectFormatV1.idSchema.parse('asset-home-crest'))).toBeNull();
    expect(resolveProjectAssetUrlV1(project, projectFormatV1.idSchema.parse('asset-replay-clip'))).toBeNull();
    expect(buildMediaAssetsV1(project)).toEqual([]);
  });
});
